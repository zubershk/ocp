package services

import (
	"os"
	"strconv"
	"sync/atomic"
	"time"
)

// sseSubscribers counts live SSE connections on this replica (metrics).
var sseSubscribers atomic.Int64

// SSESubscriberCount is read by the metrics handler via a wired callback.
func SSESubscriberCount() int64 { return sseSubscribers.Load() }

// ------------------------------------------------------------------
// Scale / deployment tuning. Every performance-sensitive behaviour is
// configurable via env so operators can tune for their topology without
// code changes. Defaults favour a single-node self-hosted install.
// ------------------------------------------------------------------

func envInt(name string, def, min, max int) int {
	v, err := strconv.Atoi(os.Getenv(name))
	if err != nil || v < min || v > max {
		return def
	}
	return v
}

func envBool(name string, def bool) bool {
	raw := os.Getenv(name)
	if raw == "" {
		return def
	}
	v, err := strconv.ParseBool(raw)
	if err != nil {
		return def
	}
	return v
}

func envDurationSecs(name string, def int) time.Duration {
	return time.Duration(envInt(name, def, 0, 86400)) * time.Second
}

// Order stream resync poll. 0 disables the poll entirely (push-only + ping).
// The old hard-coded 5s poll was ~200 qps at 1000 trackers.
func orderStreamResyncInterval() time.Duration { return envDurationSecs("ORDER_STREAM_RESYNC_SECS", 0) }

// Tenant/domain resolution cache TTL (0 disables caching).
func tenantCacheTTL() time.Duration { return envDurationSecs("TENANT_CACHE_TTL_SECS", 300) }

// Cross-replica fan-out via PostgreSQL LISTEN/NOTIFY (no extra infra needed).
func pgPubSubEnabled() bool { return envBool("PG_PUBSUB_ENABLED", true) }
func pgNotifyChannel() string {
	if v := os.Getenv("PG_NOTIFY_CHANNEL"); v != "" {
		return v
	}
	return "ocp_events"
}

// Cross-replica per-customer serialisation via PostgreSQL advisory locks.
func pgPhoneLocksEnabled() bool { return envBool("PG_PHONE_LOCKS_ENABLED", true) }

// Async broadcast queue (202 + durable job). Disable for legacy sync behaviour.
func broadcastAsyncEnabled() bool { return envBool("BROADCAST_ASYNC", true) }
func broadcastPollInterval() time.Duration { return envDurationSecs("BROADCAST_POLL_SECS", 2) }

// Bounded broadcast worker concurrency.
func broadcastWorkers() int { return envInt("BROADCAST_WORKERS", 8, 1, 128) }

// Exported for the admin package (broadcast queue).
func BroadcastAsyncEnabled() bool { return broadcastAsyncEnabled() }
func BroadcastWorkers() int       { return broadcastWorkers() }
func BroadcastPollInterval() time.Duration { return broadcastPollInterval() }

// Resync ping keepalive for SSE streams.
func ssePingInterval() time.Duration { return envDurationSecs("SSE_PING_SECS", 25) }
