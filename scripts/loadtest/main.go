// Command loadtest drives concurrent HTTP traffic at a running OCP bot to
// measure behaviour under load. Stdlib-only — no external tooling required.
//
// Usage:
//   go run ./scripts/loadtest -base http://localhost:8090 -users 200 -duration 30s
//
// It ramps virtual users, mixes read-heavy public endpoints with a few
// authenticated admin reads, and reports status counts + latency percentiles
// plus peak DB pool usage by polling /metrics when available.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"sort"
	"sync"
	"sync/atomic"
	"time"
)

type result struct {
	status int
	ms     float64
	err    bool
}

type endpoint struct {
	path   string
	weight int
	admin  bool
}

var endpoints = []endpoint{
	{path: "/api/menu", weight: 30},
	{path: "/api/config", weight: 15},
	{path: "/api/site-settings", weight: 10},
	{path: "/api/menu-categories", weight: 10},
	{path: "/api/offers", weight: 8},
	{path: "/api/banners", weight: 7},
	{path: "/api/family-packs", weight: 5},
	{path: "/api/outlets", weight: 5},
	{path: "/api/crusts", weight: 5},
	{path: "/admin/orders?limit=20", weight: 3, admin: true},
	{path: "/admin/analytics", weight: 2, admin: true},
}

var includeAdmin bool

func pick(n int) endpoint {
	total := 0
	for _, e := range endpoints {
		if e.admin && !includeAdmin { continue }
		total += e.weight
	}
	r := n % total
	for _, e := range endpoints {
		if e.admin && !includeAdmin { continue }
		if r < e.weight { return e }
		r -= e.weight
	}
	return endpoints[0]
}

func main() {
	base := flag.String("base", "http://localhost:8090", "bot base URL")
	users := flag.Int("users", 100, "concurrent virtual users")
	duration := flag.Duration("duration", 20*time.Second, "test duration")
	adminKey := flag.String("admin-key", os.Getenv("OCP_ADMIN_KEY"), "admin key for admin endpoints")
	withAdmin := flag.Bool("with-admin", false, "include admin dashboard endpoints in the mix (default: shoppers only)")
	flag.Parse()
	includeAdmin = *withAdmin

	client := &http.Client{Timeout: 10 * time.Second, Transport: &http.Transport{MaxIdleConnsPerHost: *users + 10}}
	results := make(chan result, 100000)
	var stopped atomic.Bool

	// Consume results while workers run — otherwise a full channel deadlocks
	// the workers before the post-run drain starts (seen above ~3000 RPS).
	statuses := map[int]int{}
	lats := []float64{}
	errs := 0
	consumed := make(chan struct{})
	go func() {
		for r := range results {
			if r.err { errs++; continue }
			statuses[r.status]++
			lats = append(lats, r.ms)
		}
		close(consumed)
	}()

	// Warm up
	resp, err := client.Get(*base + "/health")
	if err != nil { fmt.Println("ERROR: bot not reachable at", *base, "-", err); os.Exit(1) }
	resp.Body.Close()

	var wg sync.WaitGroup
	start := time.Now()
	for u := 0; u < *users; u++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			i := 0
			for !stopped.Load() {
				e := pick(id*31 + i)
				url := *base + e.path
				req, _ := http.NewRequest(http.MethodGet, url, nil)
				if e.admin && *adminKey != "" { req.Header.Set("X-Admin-Key", *adminKey) }
				t0 := time.Now()
				r, err := client.Do(req)
				ms := float64(time.Since(t0).Microseconds()) / 1000
				if err != nil {
					results <- result{err: true, ms: ms}
				} else {
					r.Body.Close()
					results <- result{status: r.StatusCode, ms: ms}
				}
				i++
			}
		}(u)
	}

	// Sample /metrics every 2s for DB pool usage
	peakInUse := int64(0)
	done := make(chan struct{})
	go func() {
		t := time.NewTicker(2 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-done: return
			case <-t.C:
				r, e := client.Get(*base + "/metrics")
				if e != nil { continue }
				var buf [65536]byte
				n, _ := r.Body.Read(buf[:])
				r.Body.Close()
				for _, line := range splitLines(string(buf[:n])) {
					if len(line) > 18 && line[:18] == "ocp_db_pool_in_use" {
						var v int64
						if _, e := fmt.Sscanf(line, "ocp_db_pool_in_use %d", &v); e == nil && v > peakInUse { peakInUse = v }
					}
				}
			}
		}
	}()

	time.Sleep(*duration)
	stopped.Store(true)
	wg.Wait()
	close(done)
	close(results)
	<-consumed
	elapsed := time.Since(start)

	sort.Float64s(lats)
	pct := func(p float64) float64 { if len(lats) == 0 { return 0 }; return lats[int(float64(len(lats)-1)*p)] }
	total := 0
	for _, c := range statuses { total += c }
	rps := float64(total) / elapsed.Seconds()

	fmt.Printf("\n=== Load test result ===\n")
	fmt.Printf("Users: %d | Duration: %s | Requests: %d | RPS: %.1f | Errors: %d\n", *users, *duration, total, rps, errs)
	keys := make([]int, 0, len(statuses))
	for k := range statuses { keys = append(keys, k) }
	sort.Ints(keys)
	for _, k := range keys { fmt.Printf("  HTTP %d: %d (%.1f%%)\n", k, statuses[k], 100*float64(statuses[k])/float64(total)) }
	fmt.Printf("Latency p50=%.1fms p95=%.1fms p99=%.1fms max=%.1fms\n", pct(0.5), pct(0.95), pct(0.99), pct(1.0))
	fmt.Printf("Peak DB pool in-use (from /metrics): %d\n", peakInUse)
	// Machine-readable summary for CI
	summary := map[string]interface{}{"users": *users, "duration_s": elapsed.Seconds(), "total": total, "rps": rps, "errors": errs, "statuses": statuses, "p95_ms": pct(0.95), "p99_ms": pct(0.99), "peak_db_in_use": peakInUse}
	b, _ := json.Marshal(summary)
	os.WriteFile("loadtest-summary.json", b, 0644)
	fmt.Println("Summary written to loadtest-summary.json")
}

func splitLines(s string) []string {
	out := []string{}
	cur := ""
	for _, c := range s {
		if c == '\n' { out = append(out, cur); cur = "" } else { cur += string(c) }
	}
	if cur != "" { out = append(out, cur) }
	return out
}
