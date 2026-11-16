package services

import (
	"database/sql"
	"net"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"orangecheesepizza/bot/database"
)

func parseTrustedProxies(csv string) map[string]bool {
	m := map[string]bool{}
	for _, p := range strings.Split(csv, ",") {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if h, _, err := net.SplitHostPort(p); err == nil {
			p = h
		}
		m[strings.ToLower(p)] = true
		m[p] = true
	}
	return m
}

func isTrustedClient(c *gin.Context, trusted map[string]bool) bool {
	if len(trusted) == 0 {
		return false
	}
	ip := c.ClientIP()
	if ip == "" {
		return false
	}
	if trusted[ip] || trusted[strings.ToLower(ip)] {
		return true
	}
	// loopback always trusted when trusted set is non-empty
	if pip := net.ParseIP(ip); pip != nil && pip.IsLoopback() {
		return true
	}
	// CIDR check simplified: prefix match
	for k := range trusted {
		if strings.Contains(k, "/") {
			if _, n, err := net.ParseCIDR(k); err == nil && n.Contains(net.ParseIP(ip)) {
				return true
			}
		}
	}
	return false
}

func normalizeHost(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", false
	}
	// first value of comma-separated
	if idx := strings.Index(raw, ","); idx >= 0 {
		raw = raw[:idx]
	}
	raw = strings.TrimSpace(raw)
	if h, _, err := net.SplitHostPort(raw); err == nil {
		raw = h
	}
	raw = strings.ToLower(strings.TrimSpace(raw))
	raw = strings.TrimSuffix(raw, ".")
	if raw == "" || strings.Contains(raw, " ") || strings.Contains(raw, "/") || strings.Contains(raw, ":") {
		return "", false
	}
	// basic hostname validation
	if len(raw) > 253 {
		return "", false
	}
	return raw, true
}

// TenantResolverMiddleware resolves restaurant_id from Host/domain or /r/:slug fallback.
// Priority: 1) verified custom domain, 2) subdomain of BaseDomain, 3) /r/:slug path param.
// It does not auth — just attaches tenant. RequireTenant enforces presence later.
func TenantResolverMiddleware(baseDomain string, trustedProxiesCSV string) gin.HandlerFunc {
	baseDomain = strings.ToLower(strings.TrimSpace(baseDomain))
	if baseDomain == "" {
		baseDomain = "ocp.app"
	}
	trusted := parseTrustedProxies(trustedProxiesCSV)
	return func(c *gin.Context) {
		if database.DB == nil {
			c.Next()
			return
		}
		if c.GetInt("restaurantID") != 0 {
			c.Next()
			return
		}
		// Trusted proxy: use X-Forwarded-Host else Host
		hostRaw := c.Request.Host
		if xfh := c.GetHeader("X-Forwarded-Host"); xfh != "" && isTrustedClient(c, trusted) {
			if norm, ok := normalizeHost(xfh); ok {
				hostRaw = norm
			} else {
				c.AbortWithStatusJSON(400, gin.H{"error": "invalid forwarded host"})
				return
			}
		} else if xfh := c.GetHeader("X-Forwarded-Host"); xfh != "" {
			// untrusted client sent XFH -> ignore (use Host)
			hostRaw = c.Request.Host
		}
		host, ok := normalizeHost(hostRaw)
		if !ok {
			host = strings.ToLower(strings.TrimSpace(hostRaw))
			host = strings.TrimSuffix(host, ".")
			if h, _, err := net.SplitHostPort(host); err == nil {
				host = h
			}
		} else {
			// already normalized via above; keep as is
		}
		// ensure final host is normalized
		if h, valid := normalizeHost(host); valid {
			host = h
		} else {
			host = strings.ToLower(strings.TrimSpace(host))
			host = strings.TrimSuffix(host, ".")
		}

		var rid, oid int
		if host != "" && host != "localhost" && !strings.HasPrefix(host, "127.0.0.1") {
			// Cached lookup (TENANT_CACHE_TTL_SECS). Verified domain wins.
			if found := RestaurantByDomain(host); found != 0 {
				rid = found
			} else if strings.HasSuffix(host, "."+baseDomain) {
				slug := strings.TrimSuffix(host, "."+baseDomain)
				slug = strings.TrimSuffix(slug, ".")
				if slug != "" && slug != "www" {
					rid = RestaurantBySlug(slug)
				}
			}
		}
		// local fallback /r/:slug route param
		if rid == 0 {
			if slug := c.Param("restaurantSlug"); slug != "" {
				rid = RestaurantBySlug(slug)
			}
		}
		// NOTE: ?restaurant= query param intentionally NOT honored here.
		// It allowed unauthenticated tenant selection on read and write routes,
		// which is an IDOR/brute-force vector. Tenant is resolved only from
		// host/domain or /r/:slug path.
		// Opt-in dev tenant header (OFF by default). For local/path-based
		// multi-tenant development set ALLOW_TENANT_HEADER=1 on the bot and
		// send X-Tenant-Slug from a trusted dev origin. Production leaves this
		// disabled so an attacker cannot pick a tenant with a header.
		if rid == 0 && strings.EqualFold(strings.TrimSpace(os.Getenv("ALLOW_TENANT_HEADER")), "1") {
			if slug := strings.TrimSpace(c.GetHeader("X-Tenant-Slug")); slug != "" {
				rid = RestaurantBySlug(slug)
			}
		}
		if rid != 0 {
			c.Set("restaurantID", rid)
			// default outlet for public (delivery)
			if c.GetInt("outletID") == 0 {
				if oid2 := DefaultOutletID(rid); oid2 != 0 {
					oid = oid2
					c.Set("outletID", oid)
				}
			}
			// also set orgID for entitlements (cached)
			if orgID := RestaurantOrgID(rid); orgID != 0 {
				c.Set("orgID", orgID)
			}
		}
		// also handle r/:slug in path like /r/demo/menu — extract second segment
		if rid == 0 && strings.HasPrefix(c.Request.URL.Path, "/r/") {
			parts := strings.Split(strings.TrimPrefix(c.Request.URL.Path, "/r/"), "/")
			if len(parts) > 0 && parts[0] != "" {
				slug := strings.ToLower(parts[0])
				if found := RestaurantBySlug(slug); found != 0 {
					c.Set("restaurantID", found)
					if oid2 := DefaultOutletID(found); oid2 != 0 {
						c.Set("outletID", oid2)
					}
					if orgID := RestaurantOrgID(found); orgID != 0 {
						c.Set("orgID", orgID)
					}
				} else {
					// keep slug for handler to render 404
					c.Set("restaurantSlug", slug)
				}
			}
		}
		// also ensure X-Request-ID downstream can log tenant
		_ = sql.ErrNoRows // keep import
		c.Next()
	}
}
