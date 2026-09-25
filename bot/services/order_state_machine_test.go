package services

import (
	"errors"
	"testing"
)

func TestCanTransitionDraft(t *testing.T) {
	for _, to := range []string{OrderStatusHeld, OrderStatusConfirmed, OrderStatusCancelled} {
		if !CanTransition(OrderStatusDraft, to) {
			t.Fatalf("draft -> %q should be allowed", to)
		}
	}
	if CanTransition(OrderStatusDraft, OrderStatusCompleted) {
		t.Fatal("draft -> completed must not skip payment")
	}
}

func TestCanTransitionSameStateRejected(t *testing.T) {
	// A repeated hold/resume/complete is a conflict, never a success:
	// HoldOrder's second grab must fail so two cashiers cannot both win.
	for _, s := range []string{OrderStatusDraft, OrderStatusHeld, OrderStatusConfirmed, OrderStatusCompleted, OrderStatusCancelled} {
		if CanTransition(s, s) {
			t.Fatalf("%q -> %q must be rejected", s, s)
		}
	}
}

func TestCanTransitionHeld(t *testing.T) {
	if !CanTransition(OrderStatusHeld, OrderStatusConfirmed) {
		t.Fatal("held -> confirmed (resume) should be allowed")
	}
	if !CanTransition(OrderStatusHeld, OrderStatusCancelled) {
		t.Fatal("held -> cancelled should be allowed")
	}
	if CanTransition(OrderStatusHeld, OrderStatusCompleted) {
		t.Fatal("held -> completed must resume first")
	}
	if CanTransition(OrderStatusHeld, OrderStatusDraft) {
		t.Fatal("held -> draft must not be allowed")
	}
}

func TestCanTransitionConfirmMatrix(t *testing.T) {
	// Confirm is the explicit draft/held→confirmed transition; draft→completed stays invalid.
	if !CanTransition(OrderStatusDraft, OrderStatusConfirmed) {
		t.Fatal("draft -> confirmed (confirm) should be allowed")
	}
	if !CanTransition(OrderStatusHeld, OrderStatusConfirmed) {
		t.Fatal("held -> confirmed (confirm/resume) should be allowed")
	}
	if !CanTransition(OrderStatusConfirmed, OrderStatusCompleted) {
		t.Fatal("confirmed -> completed should be allowed (due-gated)")
	}
	if !CanTransition(OrderStatusConfirmed, OrderStatusHeld) {
		t.Fatal("confirmed -> held should be allowed")
	}
	if !CanTransition(OrderStatusConfirmed, OrderStatusCancelled) {
		t.Fatal("confirmed -> cancelled should be allowed")
	}
	if CanTransition(OrderStatusDraft, OrderStatusCompleted) {
		t.Fatal("draft -> completed must stay invalid; confirm first")
	}
	if CanTransition(OrderStatusCompleted, OrderStatusConfirmed) {
		t.Fatal("completed -> confirmed must be rejected: terminal")
	}
	if CanTransition(OrderStatusCancelled, OrderStatusConfirmed) {
		t.Fatal("cancelled -> confirmed must be rejected: terminal")
	}
}

func TestCanTransitionTerminal(t *testing.T) {
	for _, from := range []string{OrderStatusCompleted, OrderStatusCancelled} {
		for _, to := range []string{OrderStatusDraft, OrderStatusHeld, OrderStatusConfirmed, OrderStatusCompleted, OrderStatusCancelled} {
			if CanTransition(from, to) {
				t.Fatalf("%q -> %q must be rejected: terminal state", from, to)
			}
		}
	}
}

func TestTerminalRejectsPaymentAndMutation(t *testing.T) {
	for _, s := range []string{OrderStatusCompleted, OrderStatusCancelled} {
		if CanAcceptPayment(s) {
			t.Fatalf("payment on %q must be rejected", s)
		}
		if CanMutateOrder(s) {
			t.Fatalf("mutation of %q must be rejected", s)
		}
	}
	for _, s := range []string{OrderStatusDraft, OrderStatusHeld, OrderStatusConfirmed} {
		if !CanAcceptPayment(s) {
			t.Fatalf("payment on %q should be allowed", s)
		}
		if !CanMutateOrder(s) {
			t.Fatalf("mutation of %q should be allowed", s)
		}
	}
}

func TestRequireTransitionError(t *testing.T) {
	if err := RequireTransition(OrderStatusDraft, OrderStatusHeld); err != nil {
		t.Fatalf("valid move rejected: %v", err)
	}
	err := RequireTransition(OrderStatusCompleted, OrderStatusHeld)
	if !errors.Is(err, ErrInvalidOrderTransition) {
		t.Fatalf("expected ErrInvalidOrderTransition, got %v", err)
	}
	err = RequireTransition("preparing", OrderStatusHeld)
	if !errors.Is(err, ErrInvalidOrderTransition) {
		t.Fatalf("unknown status must be rejected, got %v", err)
	}
}
