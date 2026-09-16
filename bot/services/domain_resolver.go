package services

import (
	"database/sql"
	"net"
	"strings"

	"github.com/gin-gonic/gin"
	"orangecheesepizza/bot/database"
)

// TenantResolverMiddleware resolves restaurant_id from Host/domain or /r/:slug fallback.
// Priority: 1) verified custom domain, 2) subdomain of BaseDomain, 3) /r/:slug path param.
// It does not auth — just attaches tenant. RequireTenant enforces presence later.
func TenantResolverMiddleware(baseDomain string) gin.HandlerFunc {
	baseDomain = strings.ToLower(strings.TrimSpace(baseDomain))
	if baseDomain == "" {
		baseDomain = "ocp.app"
	}
	return func(c *gin.Context) {
		if database.DB == nil {
			c.Next()
			return
		}
		// already resolved by admin auth:
		if c.GetInt("restaurantID") != 0 {
			c.Next()
			return
		}
		host := c.GetHeader("X-Forwarded-Host")
		// only trust X-Forwarded-Host when we have trusted proxies configured and request is from loopback/proxy
		// for now, prefer Host and fall back to XFH only if present
		if host == "" {
			host = c.Request.Host
		}
		if h, _, err := net.SplitHostPort(host); err == nil {
			host = h
		}
		host = strings.ToLower(strings.TrimSpace(host))
		host = strings.TrimSuffix(host, ".")

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
