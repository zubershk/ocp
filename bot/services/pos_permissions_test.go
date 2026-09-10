package services

import (
	"testing"
)

func TestPOSPermissionCatalog(t *testing.T) {
	if len(POSPermissions) != 7 {
		t.Fatalf("expected 7 pos.* permissions, got %d", len(POSPermissions))
	}
	seen := map[string]bool{}
	for _, p := range POSPermissions {
		if seen[p] {
			t.Fatalf("duplicate permission %q", p)
		}
		seen[p] = true
	}
}

func TestPOSRoleGrantsOwnerManagerFull(t *testing.T) {
	for _, role := range []string{"owner", "manager"} {
		for _, perm := range POSPermissions {
			if !RoleHasPOSPermission(role, perm) {
				t.Fatalf("%s should hold %s", role, perm)
			}
		}
	}
}

func TestPOSRoleGrantsCashierOperational(t *testing.T) {
	for _, perm := range []string{PermPOSRead, PermPOSCreateOrder, PermPOSUpdateOrder, PermPOSTakePayment} {
		if !RoleHasPOSPermission("cashier", perm) {
			t.Fatalf("cashier should hold %s", perm)
		}
	}
	for _, perm := range []string{PermPOSApplyDiscount, PermPOSRefund, PermPOSManageTables} {
		if RoleHasPOSPermission("cashier", perm) {
			t.Fatalf("cashier must not hold %s", perm)
		}
	}
}

func TestPOSRoleGrantsKitchenNoMoney(t *testing.T) {
	if !RoleHasPOSPermission("kitchen", PermPOSRead) {
		t.Fatal("kitchen should hold pos.read")
	}
	for _, perm := range []string{
		PermPOSCreateOrder, PermPOSUpdateOrder, PermPOSApplyDiscount,
		PermPOSTakePayment, PermPOSRefund, PermPOSManageTables,
	} {
		if RoleHasPOSPermission("kitchen", perm) {
			t.Fatalf("kitchen must not hold %s (no payment/refund)", perm)
		}
	}
}

func TestPOSRoleGrantsViewerReadOnly(t *testing.T) {
	if !RoleHasPOSPermission("viewer", PermPOSRead) {
		t.Fatal("viewer should hold pos.read")
	}
	for _, perm := range POSPermissions {
		if perm == PermPOSRead {
			continue
		}
		if RoleHasPOSPermission("viewer", perm) {
			t.Fatalf("viewer must not hold %s", perm)
		}
	}
}

func TestPOSRoleGrantsUnknown(t *testing.T) {
	if RoleHasPOSPermission("ghost", PermPOSRead) {
		t.Fatal("unknown role must hold nothing")
	}
	if RoleHasPOSPermission("owner", "pos.everything") {
		t.Fatal("unknown permission must be denied")
	}
}
