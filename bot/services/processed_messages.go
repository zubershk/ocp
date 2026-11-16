package services

import (
	"orangecheesepizza/bot/database"
)

// IsMessageProcessed reports whether messageID was already handled.
// Dial-tone safe: unknown DB or empty ID means "not processed" (fail open
// toward handling, never toward silence).
func IsMessageProcessed(messageID string) bool {
	if messageID == "" || database.DB == nil {
		return false
	}
	var exists bool
	if err := database.DB.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM processed_messages WHERE message_id=$1)`,
		messageID,
	).Scan(&exists); err != nil {
		return false
	}
	return exists
}

// TryClaimMessage atomically claims a message ID in one statement.
// Returns true if THIS caller won the claim (should process), false if
// another replica/request already claimed it (skip as duplicate).
// Eliminates the cross-replica check-then-mark race of the old two-call API.
func TryClaimMessage(messageID string) bool {
	if messageID == "" || database.DB == nil {
		return false // no ID / no DB: fail open toward handling
	}
	res, err := database.DB.Exec(
		`INSERT INTO processed_messages (message_id) VALUES ($1) ON CONFLICT DO NOTHING`,
		messageID,
	)
	if err != nil {
		return false
	}
	n, err := res.RowsAffected()
	return err == nil && n > 0
}

// MarkMessageProcessed records messageID as handled (idempotent).
// Used by the stale-message gate so redelivered backlog stays silent.
func MarkMessageProcessed(messageID string) {
	if messageID == "" || database.DB == nil {
		return
	}
	_, _ = database.DB.Exec(
		`INSERT INTO processed_messages (message_id) VALUES ($1) ON CONFLICT DO NOTHING`,
		messageID,
	)
}
