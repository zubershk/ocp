package services

// ------------------------------------------------------------------
// POS permission matrix (PR 5 hardening 6/6).
//
// Single source of truth for which roles hold which pos.* grants.
// Migration 026 seeds exactly this matrix per organization, and the
// POS routes in main.go enforce it via RequireRole+RequirePermission:
//
//	owner    full access (all pos.*)
//	manager  operational access (all pos.*)
//	cashier  create / update / pay (no refund, discount, tables)
//	kitchen  read-only (no payment, no refund)
//	viewer   read-only
// ------------------------------------------------------------------

// POS permission keys (seeded by migration 026).
const (
	PermPOSRead          = "pos.read"
	PermPOSCreateOrder   = "pos.create_order"
	PermPOSUpdateOrder   = "pos.update_order"
	PermPOSApplyDiscount = "pos.apply_discount"
	PermPOSTakePayment   = "pos.take_payment"
	PermPOSRefund        = "pos.refund"
	PermPOSManageTables  = "pos.manage_tables"
)

// POSPermissions lists every pos.* key. POSRoutePermissions in main.go
// must reference only keys from this list.
var POSPermissions = []string{
	PermPOSRead,
	PermPOSCreateOrder,
	PermPOSUpdateOrder,
	PermPOSApplyDiscount,
	PermPOSTakePayment,
	PermPOSRefund,
	PermPOSManageTables,
}

// POSRoleGrants is the intended grant matrix, mirrored by 026.
var POSRoleGrants = map[string][]string{
	"owner": {
		PermPOSRead, PermPOSCreateOrder, PermPOSUpdateOrder,
		PermPOSApplyDiscount, PermPOSTakePayment, PermPOSRefund,
		PermPOSManageTables,
	},
	"manager": {
		PermPOSRead, PermPOSCreateOrder, PermPOSUpdateOrder,
		PermPOSApplyDiscount, PermPOSTakePayment, PermPOSRefund,
		PermPOSManageTables,
	},
	"cashier": {
		PermPOSRead, PermPOSCreateOrder, PermPOSUpdateOrder,
		PermPOSTakePayment,
	},
	"kitchen": {PermPOSRead},
	"viewer":  {PermPOSRead},
}

// RoleHasPOSPermission reports whether role holds perm under the matrix.
func RoleHasPOSPermission(role, perm string) bool {
	for _, p := range POSRoleGrants[role] {
		if p == perm {
			return true
		}
	}
	return false
}
