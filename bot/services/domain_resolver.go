package services

import (
	"database/sql"
	"net"
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
			// try domains table first (verified wins)
			var found int
			err := database.DB.QueryRow(`SELECT restaurant_id FROM domains WHERE lower(domain)=lower($1) AND verified_at IS NOT NULL LIMIT 1`, host).Scan(&found)
			if err == nil && found != 0 {
				rid = found
			} else if strings.HasSuffix(host, "."+baseDomain) {
				slug := strings.TrimSuffix(host, "."+baseDomain)
				slug = strings.TrimSuffix(slug, ".")
				if slug != "" && slug != "www" {
					_ = database.DB.QueryRow(`SELECT id FROM restaurants WHERE lower(slug)=lower($1) LIMIT 1`, slug).Scan(&found)
					if found != 0 {
						rid = found
					}
				}
			}
		}
		// local fallback /r/:slug or /r/slug query
		if rid == 0 {
			if slug := c.Param("restaurantSlug"); slug != "" {
				var found int
				_ = database.DB.QueryRow(`SELECT id FROM restaurants WHERE lower(slug)=lower($1) LIMIT 1`, strings.ToLower(slug)).Scan(&found)
				if found != 0 {
					rid = found
				}
			}
		}
		if rid == 0 {
			if slug := c.Query("restaurant"); slug != "" {
				var found int
				_ = database.DB.QueryRow(`SELECT id FROM restaurants WHERE lower(slug)=lower($1) LIMIT 1`, strings.ToLower(slug)).Scan(&found)
				if found != 0 {
					rid = found
				}
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
			// also set orgID for entitlements
			var orgID int
			if err := database.DB.QueryRow(`SELECT organization_id FROM restaurants WHERE id=$1`, rid).Scan(&orgID); err == nil {
				c.Set("orgID", orgID)
			}
		}
		// also handle r/:slug in path like /r/demo/menu — extract second segment
		if rid == 0 && strings.HasPrefix(c.Request.URL.Path, "/r/") {
			parts := strings.Split(strings.TrimPrefix(c.Request.URL.Path, "/r/"), "/")
			if len(parts) > 0 && parts[0] != "" {
				slug := strings.ToLower(parts[0])
				var found int
				if err := database.DB.QueryRow(`SELECT id FROM restaurants WHERE lower(slug)=lower($1) LIMIT 1`, slug).Scan(&found); err == nil && found != 0 {
					c.Set("restaurantID", found)
					if oid2 := DefaultOutletID(found); oid2 != 0 {
						c.Set("outletID", oid2)
					}
					var orgID int
					_ = database.DB.QueryRow(`SELECT organization_id FROM restaurants WHERE id=$1`, found).Scan(&orgID)
					c.Set("orgID", orgID)
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
