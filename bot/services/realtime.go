package services

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// ------------------------------------------------------------------
// Realtime event hub (Server-Sent Events).
// Frontend connects with fetch + X-Admin-Key header (EventSource can't
// set headers, so we deliberately do NOT accept key query params).
// ------------------------------------------------------------------

type realtimeEvent struct {
	Type string      `json:"type"`
	At   time.Time   `json:"at"`
	Data interface{} `json:"data,omitempty"`
}

type realtimeHub struct {
	mu   sync.RWMutex
	subs map[chan realtimeEvent]struct{}
}

var hub = &realtimeHub{subs: make(map[chan realtimeEvent]struct{})}

// BroadcastRealtime fans an event out to all connected dashboards.
// Never blocks the caller; slow subscribers are skipped.
func BroadcastRealtime(eventType string, data interface{}) {
	hub.mu.RLock()
	defer hub.mu.RUnlock()
	ev := realtimeEvent{Type: eventType, At: time.Now().UTC(), Data: data}
	for ch := range hub.subs {
		select {
		case ch <- ev:
		default:
		}
	}
}

// StreamEvents handles GET /admin/events/stream — long-lived SSE feed.
func StreamEvents(c *gin.Context) {
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming unsupported"})
		return
	}
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	ch := make(chan realtimeEvent, 32)
	hub.mu.Lock()
	hub.subs[ch] = struct{}{}
	hub.mu.Unlock()
	defer func() {
		hub.mu.Lock()
		delete(hub.subs, ch)
		close(ch)
		hub.mu.Unlock()
	}()

	writeSSE(c, realtimeEvent{Type: "hello", At: time.Now().UTC()})
	flusher.Flush()

	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()
	ctx := c.Request.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case ev := <-ch:
			writeSSE(c, ev)
			flusher.Flush()
		case t := <-ticker.C:
			writeSSE(c, realtimeEvent{Type: "ping", At: t.UTC()})
			flusher.Flush()
		}
	}
}

func writeSSE(c *gin.Context, ev realtimeEvent) {
	b, err := json.Marshal(ev)
	if err != nil {
		return
	}
	fmt.Fprintf(c.Writer, "data: %s\n\n", string(b))
}
