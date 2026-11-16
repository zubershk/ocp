package services

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"os"
	"regexp"
	"time"

	"github.com/lib/pq"
	"orangecheesepizza/bot/database"
)

// ------------------------------------------------------------------
// Cross-replica event fan-out using PostgreSQL LISTEN/NOTIFY.
//
// Each bot replica holds a pq.Listener on a shared channel. Local broadcasts
// are delivered immediately AND published; remote replicas receive the NOTIFY
// and deliver to their own local subscribers. This makes SSE/order events
// work with N replicas without adding Redis. Toggle: PG_PUBSUB_ENABLED.
// ------------------------------------------------------------------

var pubSubInstanceID = randomInstanceID()

func randomInstanceID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "pid-" + hex.EncodeToString([]byte(time.Now().Format("150405")))
	}
	return hex.EncodeToString(b)
}

type pubSubEnvelope struct {
	Origin       string      `json:"o"`
	Kind         string      `json:"k"` // "realtime" | "order"
	RestaurantID int         `json:"r,omitempty"`
	OutletID     int         `json:"u,omitempty"`
	OrgID        int         `json:"g,omitempty"`
	EventType    string      `json:"t,omitempty"`
	OrderID      int         `json:"i,omitempty"`
	OrderNumber  string      `json:"n,omitempty"`
	Status       string      `json:"s,omitempty"`
	Data         interface{} `json:"d,omitempty"`
}

var channelNameRe = regexp.MustCompile(`^[a-zA-Z][a-zA-Z0-9_]{0,62}$`)

// StartPubSub begins the listener loop. Called once at startup.
func StartPubSub() {
	if !pgPubSubEnabled() {
		return
	}
	channel := pgNotifyChannel()
	if !channelNameRe.MatchString(channel) {
		log.Printf("[pubsub] invalid PG_NOTIFY_CHANNEL %q — disabling cross-replica fan-out", channel)
		return
	}
	dsn := os.Getenv("BOT_DATABASE_URL")
	if dsn == "" {
		log.Printf("[pubsub] BOT_DATABASE_URL unset — cross-replica fan-out disabled")
		return
	}
	listener := pq.NewListener(dsn, 100*time.Millisecond, 5*time.Second, func(ev pq.ListenerEventType, err error) {
		if err != nil {
			log.Printf("[pubsub] listener event %d: %v", ev, err)
		}
	})
	if err := listener.Listen(channel); err != nil {
		log.Printf("[pubsub] LISTEN %s failed: %v — cross-replica fan-out disabled", channel, err)
		return
	}
	log.Printf("[pubsub] listening on %s (instance %s)", channel, pubSubInstanceID)
	go func() {
		for n := range listener.NotificationChannel() {
			var env pubSubEnvelope
			if err := json.Unmarshal([]byte(n.Extra), &env); err != nil {
				continue
			}
			if env.Origin == pubSubInstanceID {
				continue // our own broadcast, already delivered locally
			}
			switch env.Kind {
			case "realtime":
				broadcastRealtimeLocal(env.RestaurantID, env.OutletID, env.OrgID, env.EventType, env.Data)
			case "order":
				broadcastOrderStatusLocal(env.OrderID, env.OrderNumber, env.Status)
			}
		}
	}()
}

// publish sends an envelope to all replicas via pg_notify.
func publish(env pubSubEnvelope) {
	if !pgPubSubEnabled() || database.DB == nil {
		return
	}
	env.Origin = pubSubInstanceID
	b, err := json.Marshal(env)
	if err != nil {
		return
	}
	_, _ = database.DB.Exec(`SELECT pg_notify($1, $2)`, pgNotifyChannel(), string(b))
}
