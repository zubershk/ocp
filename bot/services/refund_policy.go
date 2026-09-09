package services

import (
	"errors"
	"fmt"
)

// ------------------------------------------------------------------
// Refund invariants (PR 5 hardening 2/6).
//
// The ledger is authoritative: original payment rows are never
// mutated or deleted, and every refund is a negative-amount row
// linked via refund_of. Refundable balance is always derived:
//
//	+1000 payment
//	 -600 refund
//	---------
//	  400 refundable
//
// No stored mutable "refunded total" may become a second source of
// truth. ValidateRefundRequest enforces every invariant in one place
// so both the service and the tests share the same rules.
// ------------------------------------------------------------------

var (
	ErrRefundNotFound        = errors.New("original payment not found")
	ErrRefundOfRefund        = errors.New("cannot refund a refund")
	ErrRefundNotAPayment     = errors.New("original row is not a positive payment")
	ErrRefundOrderMismatch   = errors.New("payment does not belong to this order")
	ErrRefundTenantMismatch  = errors.New("payment does not belong to current restaurant/outlet")
	ErrRefundAmountInvalid   = errors.New("refund amount must be positive")
	ErrRefundExceedsRemain   = errors.New("refund exceeds remaining refundable amount")
	ErrRefundAlreadyComplete = errors.New("payment is already fully refunded")
)

// RefundCheck carries the ledger-derived facts about one payment.
type RefundCheck struct {
	OriginalAmountPaise int64 // positive amount of the original payment
	AlreadyRefundedPaise int64 // abs sum of prior refunds against it
	OriginalRefundOf    int   // nonzero when the "original" is itself a refund
	OriginalOrderID     int
	OriginalRestaurantID int
	OriginalOutletID    int
}

// RemainingRefundable is the ledger-derived balance for this payment.
func (c RefundCheck) RemainingRefundable() int64 {
	rem := c.OriginalAmountPaise - c.AlreadyRefundedPaise
	if rem < 0 {
		return 0
	}
	return rem
}

// ValidateRefundRequest enforces all six refund gates. requestedPaise
// is positive (the amount the cashier wants to return); it is stored
// as a negative ledger row by RecordRefund.
func ValidateRefundRequest(c RefundCheck, orderID, restaurantID, outletID int, requestedPaise int64) error {
	if c.OriginalRefundOf != 0 {
		return ErrRefundOfRefund
	}
	if c.OriginalAmountPaise <= 0 {
		return ErrRefundNotAPayment
	}
	if c.OriginalOrderID != orderID {
		return ErrRefundOrderMismatch
	}
	if c.OriginalRestaurantID != restaurantID || c.OriginalOutletID != outletID {
		return ErrRefundTenantMismatch
	}
	if requestedPaise <= 0 {
		return ErrRefundAmountInvalid
	}
	remaining := c.RemainingRefundable()
	if remaining <= 0 {
		return ErrRefundAlreadyComplete
	}
	if requestedPaise > remaining {
		return fmt.Errorf("%w: requested %d paise, %d paise remain",
			ErrRefundExceedsRemain, requestedPaise, remaining)
	}
	return nil
}
