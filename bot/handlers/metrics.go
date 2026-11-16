package handlers

import (
	"fmt"
	"net/http"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
)

// Metrics is a lightweight, dependency-free Prometheus-style metrics registry.
// Covers the signals needed to detect saturation: request rate/latency/errors
// by route, DB pool usage, rate-limit rejects, and goroutine count.
var Metrics = struct {
	mu             sync.RWMutex
	requests       map[string]*routeMetric
	rateLimited    atomic.Int64
	dbInUse        atomic.Int64
	dbMaxOpen      atomic.Int64
}{requests: make(map[string]*routeMetric)}

type routeMetric struct {
	count    atomic.Int64
	errors   atomic.Int64
	sumNanos atomic.Int64
}

var dbStatsProvider func() (inUse, maxOpen int)
var sseProvider func() int64

// SetDBStatsProvider wires the database pool stats into metrics.
func SetDBStatsProvider(fn func() (inUse, maxOpen int)) { dbStatsProvider = fn }

// SetSSEProvider wires the SSE subscriber count into metrics (services package
// cannot import handlers without a cycle, so main.go bridges the two).
func SetSSEProvider(fn func() int64) { sseProvider = fn }

// IncRateLimited records a rejected (429) request.
func IncRateLimited() { Metrics.rateLimited.Add(1) }

// MetricsMiddleware records per-route latency, count and 5xx errors.
func MetricsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		route := c.FullPath()
		if route == "" {
			route = c.Request.URL.Path
		}
		key := c.Request.Method + " " + route
		Metrics.mu.RLock()
		m, ok := Metrics.requests[key]
		Metrics.mu.RUnlock()
		if !ok {
			Metrics.mu.Lock()
			m = &routeMetric{}
			Metrics.requests[key] = m
			Metrics.mu.Unlock()
		}
		m.count.Add(1)
		if c.Writer.Status() >= 500 {
			m.errors.Add(1)
		}
		m.sumNanos.Add(time.Since(start).Nanoseconds())
	}
}

// MetricsHandler renders Prometheus text format.
func MetricsHandler(c *gin.Context) {
	if dbStatsProvider != nil {
		inUse, maxOpen := dbStatsProvider()
		Metrics.dbInUse.Store(int64(inUse))
		Metrics.dbMaxOpen.Store(int64(maxOpen))
	}
	c.Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	var b strings.Builder
	b.WriteString("# HELP ocp_http_requests_total Total HTTP requests by route.\n")
	b.WriteString("# TYPE ocp_http_requests_total counter\n")
	b.WriteString("# HELP ocp_http_request_errors_total Total 5xx responses by route.\n")
	b.WriteString("# TYPE ocp_http_request_errors_total counter\n")
	b.WriteString("# HELP ocp_http_request_duration_seconds_sum Total request duration by route.\n")
	b.WriteString("# TYPE ocp_http_request_duration_seconds_sum counter\n")

	Metrics.mu.RLock()
	keys := make([]string, 0, len(Metrics.requests))
	for k := range Metrics.requests {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		m := Metrics.requests[k]
		labels := metricLabels(k)
		fmt.Fprintf(&b, "ocp_http_requests_total%s %d\n", labels, m.count.Load())
		fmt.Fprintf(&b, "ocp_http_request_errors_total%s %d\n", labels, m.errors.Load())
		fmt.Fprintf(&b, "ocp_http_request_duration_seconds_sum%s %.6f\n", labels, float64(m.sumNanos.Load())/1e9)
	}
	Metrics.mu.RUnlock()

	b.WriteString("# HELP ocp_rate_limited_total Rejected requests (429).\n")
	b.WriteString("# TYPE ocp_rate_limited_total counter\n")
	fmt.Fprintf(&b, "ocp_rate_limited_total %d\n", Metrics.rateLimited.Load())
	b.WriteString("# HELP ocp_db_pool_in_use Database connections currently in use.\n")
	b.WriteString("# TYPE ocp_db_pool_in_use gauge\n")
	fmt.Fprintf(&b, "ocp_db_pool_in_use %d\n", Metrics.dbInUse.Load())
	b.WriteString("# HELP ocp_db_pool_max_open Configured max open connections.\n")
	b.WriteString("# TYPE ocp_db_pool_max_open gauge\n")
	fmt.Fprintf(&b, "ocp_db_pool_max_open %d\n", Metrics.dbMaxOpen.Load())
	b.WriteString("# HELP ocp_sse_subscribers Active SSE subscribers on this replica.\n")
	b.WriteString("# TYPE ocp_sse_subscribers gauge\n")
	var sseCount int64
	if sseProvider != nil {
		sseCount = sseProvider()
	}
	fmt.Fprintf(&b, "ocp_sse_subscribers %d\n", sseCount)
	b.WriteString("# HELP ocp_goroutines Goroutines in this process.\n")
	b.WriteString("# TYPE ocp_goroutines gauge\n")
	fmt.Fprintf(&b, "ocp_goroutines %d\n", runtime.NumGoroutine())
	c.String(http.StatusOK, b.String())
}

func metricLabels(key string) string {
	parts := strings.SplitN(key, " ", 2)
	method, route := "GET", key
	if len(parts) == 2 {
		method, route = parts[0], parts[1]
	}
	return fmt.Sprintf("{method=%s,route=%s}", strconv.Quote(method), strconv.Quote(route))
}
