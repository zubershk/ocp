package handlers

import (
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"orangecheesepizza/bot/database"
)

// rateLimitBackend: "local" (per-process) or "postgres" (shared across
// replicas). Default postgres so limits cannot be bypassed by DNS round-robin.
func rateLimitBackend() string {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("RATE_LIMIT_BACKEND")))
	if v == "local" {
		return "local"
	}
	return "postgres"
}

// pgAllow implements an atomic fixed-window counter in PostgreSQL. One UPDATE
// statement is safe across replicas; returns false when the budget is spent.
func pgAllow(key string, limit int, window time.Duration) bool {
	if database.DB == nil {
		return true // fail open if DB unavailable (local limiter still applies)
	}
	var count int
	secs := int(window.Seconds())
	err := database.DB.QueryRow(`
		INSERT INTO rate_limit_counters (key, window_start, count) VALUES ($1, NOW(), 1)
		ON CONFLICT (key) DO UPDATE SET
			count = CASE WHEN EXTRACT(EPOCH FROM (NOW() - rate_limit_counters.window_start)) >= $2
				THEN 1 ELSE rate_limit_counters.count + 1 END,
			window_start = CASE WHEN EXTRACT(EPOCH FROM (NOW() - rate_limit_counters.window_start)) >= $2
				THEN NOW() ELSE rate_limit_counters.window_start END
		RETURNING count
	`, key, secs).Scan(&count)
	if err != nil {
		return true // fail open
	}
	return count <= limit
}

// startRateLimitCleanup purges stale counter rows periodically.
func startRateLimitCleanup() {
	go func() {
		for range time.Tick(10 * time.Minute) {
			if database.DB != nil {
				_, _ = database.DB.Exec(`DELETE FROM rate_limit_counters WHERE window_start < NOW() - INTERVAL '1 day'`)
			}
		}
	}()
}

type windowCounter struct {
	count int
	start time.Time
}

type ipLimiter struct {
	mu      sync.Mutex
	windows map[string]*windowCounter
	limit   int
	window  time.Duration
}

func newIPLimiter(limit int, window time.Duration) *ipLimiter {
	return &ipLimiter{
		windows: make(map[string]*windowCounter),
		limit:   limit,
		window:  window,
	}
}

func (l *ipLimiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	w, ok := l.windows[ip]
	if !ok || now.Sub(w.start) >= l.window {
		l.windows[ip] = &windowCounter{count: 1, start: now}
		return true
	}
	if w.count >= l.limit {
		return false
	}
	w.count++
	return true
}

// cleanup runs periodically to prevent unbounded growth.
func (l *ipLimiter) cleanupLoop() {
	for range time.Tick(10 * time.Minute) {
		l.mu.Lock()
		cutoff := time.Now().Add(-l.window)
		for ip, w := range l.windows {
			if w.start.Before(cutoff) {
				delete(l.windows, ip)
			}
		}
		l.mu.Unlock()
	}
}

// RateLimit returns middleware that limits each IP to `limit` requests per `window`.
// With RATE_LIMIT_BACKEND=postgres (default) the counter is shared across all
// replicas; otherwise a local in-process limiter is used. c.ClientIP() respects
// gin TrustedProxies — configure TRUSTED_PROXIES behind a real load balancer.
func RateLimit(limit int, window time.Duration) gin.HandlerFunc {
	lim := newIPLimiter(limit, window)
	go lim.cleanupLoop()
	startRateLimitCleanup()
	shared := rateLimitBackend() == "postgres"
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if ip == "" {
			ip = c.Request.RemoteAddr
			if idx := strings.LastIndex(ip, ":"); idx != -1 {
				ip = ip[:idx] // strip port
			}
		}
		if ip == "" {
			ip = "unknown"
		}
		key := c.FullPath() + "|" + ip
		allowed := lim.allow(ip) // local fast path always applies
		if allowed && shared {
			allowed = pgAllow(key, limit, window)
		}
		if !allowed {
			IncRateLimited()
			c.Header("Retry-After", strconv.Itoa(int(window.Seconds())))
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many requests — please slow down"})
			c.Abort()
			return
		}
		c.Next()
	}
}
