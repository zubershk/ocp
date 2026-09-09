package services

import (
	"errors"
	"fmt"
)

// ------------------------------------------------------------------
// POS order state machine (PR 5 hardening 3/6).
//
// Valid transitions are explicit and enforced server-side — the
// frontend never decides what an order may become:
//
//	draft
//	 ├── hold      -> held
//	 ├── confirm   -> confirmed
//	 ├── cancel    -> cancelled
//	 └── payment (stays in place until completed)
//
//	held
//	 ├── resume    -> confirmed
//	 └── cancel    -> cancelled
//
//	confirmed
//	 ├── hold      -> held
//	 ├── complete  -> completed (only when due == 0)
//	 └── cancel    -> cancelled
//
//	completed -> refund (ledger-only; status never moves again)
//	cancelled -> terminal, nothing may move it
//
// completed/cancelled therefore reject hold, resume, payment,
// discount, and table changes. Every POS mutation goes through
// RequireTransition or one of the Can* predicates below; handlers
// must not invent their own rules.
// ------------------------------------------------------------------

// POS order statuses (subset of orders.status used by the POS flow).
const (
	OrderStatusDraft     = "draft"
	OrderStatusHeld      = "held"
	OrderStatusConfirmed = "confirmed"
	OrderStatusCompleted = "completed"
	OrderStatusCancelled = "cancelled"
)

// ErrInvalidOrderTransition is returned when a mutation asks for a
// status move the machine does not allow.
var ErrInvalidOrderTransition = errors.New("invalid order status transition")

// ErrOrderNotFound is returned when a POS mutation targets a missing order.
var ErrOrderNotFound = errors.New("order not found")

// ErrOrderHasDue is returned when completing an order that still has
// an outstanding ledger balance.
var ErrOrderHasDue = errors.New("order has outstanding due")

// orderTransitions is the single source of truth for status moves.
var orderTransitions = map[string]map[string]bool{
	OrderStatusDraft: {
		OrderStatusHeld:      true,
		OrderStatusConfirmed: true,
		OrderStatusCancelled: true,
	},
	OrderStatusHeld: {
		OrderStatusConfirmed: true,
		OrderStatusCancelled: true,
	},
	OrderStatusConfirmed: {
		OrderStatusHeld:      true,
		OrderStatusCompleted: true,
		OrderStatusCancelled: true,
	},
	OrderStatusCompleted: {},
	OrderStatusCancelled: {},
}

// CanTransition reports whether status may move from -> to.
func CanTransition(from, to string) bool {
	if from == to {
		return true // idempotent replays of the same state are harmless
	}
	nexts, ok := orderTransitions[from]
	if !ok {
		return false
	}
	return nexts[to]
}

// RequireTransition enforces a status move or returns a wrapped
// ErrInvalidOrderTransition naming both ends.
func RequireTransition(from, to string) error {
	if CanTransition(from, to) {
		return nil
	}
	return fmt.Errorf("%w: %q -> %q", ErrInvalidOrderTransition, from, to)
}

// CanAcceptPayment reports whether a payment may post to an order in
// this status. Payment never changes status by itself; completion is
// a separate, due-gated transition.
func CanAcceptPayment(status string) bool {
	switch status {
	case OrderStatusDraft, OrderStatusHeld, OrderStatusConfirmed:
		return true
	}
	return false
}

// CanMutateOrder reports whether discount/table/item edits are allowed.
// Completed and cancelled orders are frozen; history must not change.
func CanMutateOrder(status string) bool {
	switch status {
	case OrderStatusDraft, OrderStatusHeld, OrderStatusConfirmed:
		return true
	}
	return false
}
