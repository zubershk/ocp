package handlers

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

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
func RateLimit(limit int, window time.Duration) gin.HandlerFunc {
	lim := newIPLimiter(limit, window)
	go lim.cleanupLoop()
	return func(c *gin.Context) {
		// Use RemoteAddr directly to prevent spoofing via X-Forwarded-For.
		// If behind a trusted reverse proxy (nginx/cloudflare), set TrustedProxies in gin instead.
		ip := c.Request.RemoteAddr
		if idx := strings.LastIndex(ip, ":"); idx != -1 {
			ip = ip[:idx] // strip port
		}
		if ip == "" {
			ip = "unknown"
		}
		if !lim.allow(ip) {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many requests — please slow down"})
			c.Abort()
			return
		}
		c.Next()
	}
}
