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
// Per-order SSE hub: pushes status changes to tracking pages instead
// of the client polling every N seconds.
// ------------------------------------------------------------------

type orderStreamEvent struct {
	Type         string      `json:"type"`
	At           time.Time   `json:"at"`
	OrderID      int         `json:"order_id,omitempty"`
	OrderNumber  string      `json:"order_number,omitempty"`
	Status       string      `json:"status,omitempty"`
	Data         interface{} `json:"data,omitempty"`
}

type orderSub struct {
	ch      chan orderStreamEvent
	orderID int
}

type orderHub struct {
	mu   sync.RWMutex
	subs map[chan orderStreamEvent]*orderSub
}

var orderHubInstance = &orderHub{subs: make(map[chan orderStreamEvent]*orderSub)}

// BroadcastOrderStatus fans a status change to all tracking subscribers for that order.
func BroadcastOrderStatus(orderID int, orderNumber, status string) {
	orderHubInstance.mu.RLock()
	defer orderHubInstance.mu.RUnlock()
	ev := orderStreamEvent{Type: "order.status", At: time.Now().UTC(), OrderID: orderID, OrderNumber: orderNumber, Status: status}
	for ch, sub := range orderHubInstance.subs {
		if sub.orderID != orderID {
			continue
		}
		select {
		case ch <- ev:
		default:
		}
	}
}

// StreamOrderEvents handles GET /api/orders/:id/stream — long-lived SSE feed for a single order.
func StreamOrderEvents(c *gin.Context, orderID int) {
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming unsupported"})
		return
	}
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	ch := make(chan orderStreamEvent, 16)
	sub := &orderSub{ch: ch, orderID: orderID}
	orderHubInstance.mu.Lock()
	orderHubInstance.subs[ch] = sub
	orderHubInstance.mu.Unlock()
	defer func() {
		orderHubInstance.mu.Lock()
		delete(orderHubInstance.subs, ch)
		close(ch)
		orderHubInstance.mu.Unlock()
	}()

	// initial state
	lastStatus := ""
	if o, err := defaultOrderService.GetOrderByID(orderID, 0); err == nil && o != nil {
		lastStatus = o.Status
		writeOrderSSE(c, orderStreamEvent{Type: "order.snapshot", At: time.Now().UTC(), OrderID: orderID, OrderNumber: o.OrderNumber, Status: o.Status})
		flusher.Flush()
	}

	writeOrderSSE(c, orderStreamEvent{Type: "hello", At: time.Now().UTC()})
	flusher.Flush()

	statusTicker := time.NewTicker(5 * time.Second)
	defer statusTicker.Stop()
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()
	ctx := c.Request.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case ev := <-ch:
			if ev.Status != "" && ev.Status != lastStatus {
				lastStatus = ev.Status
			}
			writeOrderSSE(c, ev)
			flusher.Flush()
		case <-statusTicker.C:
			if o, err := defaultOrderService.GetOrderByID(orderID, 0); err == nil && o != nil {
				if o.Status != lastStatus {
					lastStatus = o.Status
					writeOrderSSE(c, orderStreamEvent{Type: "order.status", At: time.Now().UTC(), OrderID: orderID, OrderNumber: o.OrderNumber, Status: o.Status})
					flusher.Flush()
				}
			}
		case t := <-ticker.C:
			writeOrderSSE(c, orderStreamEvent{Type: "ping", At: t.UTC()})
			flusher.Flush()
		}
	}
}

func writeOrderSSE(c *gin.Context, ev orderStreamEvent) {
	b, err := json.Marshal(ev)
	if err != nil {
		return
	}
	fmt.Fprintf(c.Writer, "data: %s\n\n", string(b))
}