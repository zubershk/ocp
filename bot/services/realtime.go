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
	Type         string      `json:"type"`
	At           time.Time   `json:"at"`
	Data         interface{} `json:"data,omitempty"`
	RestaurantID int         `json:"restaurant_id,omitempty"`
	OutletID     int         `json:"outlet_id,omitempty"`
	OrgID        int         `json:"org_id,omitempty"`
}

type realtimeSub struct {
	ch           chan realtimeEvent
	restaurantID int
	outletID     int
	orgID        int
}

type realtimeHub struct {
	mu   sync.RWMutex
	subs map[chan realtimeEvent]*realtimeSub
}

var hub = &realtimeHub{subs: make(map[chan realtimeEvent]*realtimeSub)}

// BroadcastRealtime fans an event out to all connected dashboards.
// Never blocks the caller; slow subscribers are skipped.
func BroadcastRealtime(eventType string, data interface{}) {
	BroadcastRealtimeFor(0, 0, 0, eventType, data)
}

// BroadcastRealtimeFor fans only to subscribers matching tenant (0 = restaurant-wide, specific outletID filters).
func BroadcastRealtimeFor(restaurantID, outletID, orgID int, eventType string, data interface{}) {
	hub.mu.RLock()
	defer hub.mu.RUnlock()
	ev := realtimeEvent{Type: eventType, At: time.Now().UTC(), Data: data, RestaurantID: restaurantID, OutletID: outletID, OrgID: orgID}
	for ch, sub := range hub.subs {
		if sub.restaurantID != 0 && restaurantID != 0 && sub.restaurantID != restaurantID {
			continue
		}
		if sub.orgID != 0 && orgID != 0 && sub.orgID != orgID {
			continue
		}
		if sub.outletID != 0 && outletID != 0 && sub.outletID != outletID {
			continue
		}
		// outletID==0 means restaurant-wide event → all outlets in restaurant; don't filter
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
	sub := &realtimeSub{ch: ch, restaurantID: c.GetInt("restaurantID"), outletID: c.GetInt("outletID"), orgID: c.GetInt("orgID")}
	hub.mu.Lock()
	hub.subs[ch] = sub
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
