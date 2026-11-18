package handlers

import (
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// PublicReadCache is a short-TTL, read-through cache for anonymous storefront
// GETs. At 1000+ concurrent shoppers these endpoints otherwise repeat the same
// Postgres reads on every request and saturate the DB pool (measured: 25/25
// conns pinned, 3.7s p95, ~11% timeouts). Caching the rendered bytes keeps the
// pool free for writes and cuts p95 dramatically.
//
// It is intentionally simple and eventually consistent:
//   - Admin writes clear it immediately via InvalidatePublicCacheOnWrite.
//   - TTL bounds staleness from changes on other bot replicas.
//   - Personal/auth/order/coupon-validation paths are never cached.
//
// Set PUBLIC_READ_CACHE_TTL_SECS=0 to disable (always read through).
type cachedResponse struct {
	body        []byte
	contentType string
	status      int
	expires     time.Time
}

type publicReadCacheStore struct {
	mu   sync.RWMutex
	data map[string]cachedResponse
}

func newPublicReadCache() *publicReadCacheStore {
	return &publicReadCacheStore{data: make(map[string]cachedResponse)}
}

func (c *publicReadCacheStore) get(key string) (cachedResponse, bool) {
	c.mu.RLock()
	e, ok := c.data[key]
	c.mu.RUnlock()
	if !ok || !time.Now().Before(e.expires) {
		return cachedResponse{}, false
	}
	return e, true
}

func (c *publicReadCacheStore) set(key string, v cachedResponse, ttl time.Duration) {
	c.mu.Lock()
	c.data[key] = v
	c.mu.Unlock()
}

func (c *publicReadCacheStore) clear() {
	c.mu.Lock()
	c.data = make(map[string]cachedResponse)
	c.mu.Unlock()
}

var publicReadCache = newPublicReadCache()

// publicCacheTTL reads PUBLIC_READ_CACHE_TTL_SECS (default 15s, 0 disables).
func publicCacheTTL() time.Duration {
	secs, err := strconv.Atoi(strings.TrimSpace(os.Getenv("PUBLIC_READ_CACHE_TTL_SECS")))
	if err != nil || secs < 0 || secs > 86400 {
		return 15 * time.Second
	}
	return time.Duration(secs) * time.Second
}

// cacheablePublicGET reports whether a response is safe to share across all
// anonymous shoppers of a tenant. Personal or stateful paths are excluded.
func cacheablePublicGET(c *gin.Context) bool {
	if c.Request.Method != http.MethodGet {
		return false
	}
	p := c.Request.URL.Path
	if !strings.HasPrefix(p, "/api/") {
		return false
	}
	for _, excluded := range []string{"/api/auth/", "/api/orders/", "/api/coupons/validate", "/stream"} {
		if strings.Contains(p, excluded) {
			return false
		}
	}
	return true
}

// PublicReadCache caches successful public GET responses. Register it after
// the tenant resolver so restaurantID is present in the cache key.
func PublicReadCache() gin.HandlerFunc {
	return func(c *gin.Context) {
		ttl := publicCacheTTL()
		if ttl <= 0 || !cacheablePublicGET(c) {
			c.Next()
			return
		}
		key := c.FullPath() + "|" + c.Request.URL.RawQuery + "|" + strconv.Itoa(c.GetInt("restaurantID"))
		if e, ok := publicReadCache.get(key); ok {
			c.Data(e.status, e.contentType, e.body)
			c.Abort()
			return
		}

		// Buffer the handler output (reusing the ETag buffer) so we can store
		// the rendered bytes and still let the ETag layer hash them.
		bw := &etagBuffer{ResponseWriter: c.Writer, status: http.StatusOK}
		c.Writer = bw
		c.Next()

		body := bw.buf.Bytes()
		hdr := bw.Header()
		if bw.status == http.StatusOK && len(body) > 0 &&
			hdr.Get("Set-Cookie") == "" && !strings.Contains(hdr.Get("Vary"), "*") &&
			!strings.Contains(hdr.Get("Cache-Control"), "no-store") {
			cp := append([]byte(nil), body...)
			e := cachedResponse{
				body:        cp,
				contentType: hdr.Get("Content-Type"),
				status:      bw.status,
				expires:     time.Now().Add(ttl),
			}
			publicReadCache.set(key, e, ttl)
		}
		bw.flush()
	}
}

// InvalidatePublicCacheOnWrite clears cached public reads after any successful
// admin mutation, so changes appear immediately on the writing replica.
func InvalidatePublicCacheOnWrite() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		m := c.Request.Method
		if m == http.MethodPost || m == http.MethodPut || m == http.MethodPatch || m == http.MethodDelete {
			if s := c.Writer.Status(); s >= 200 && s < 400 {
				publicReadCache.clear()
			}
		}
	}
}
