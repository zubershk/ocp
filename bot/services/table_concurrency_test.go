package services

import (
	"errors"
	"testing"
)

func TestAllowedTableSources(t *testing.T) {
	contains := func(ss []string, want string) bool {
		for _, s := range ss {
			if s == want {
				return true
			}
		}
		return false
	}
	// Only a free table may be claimed: the core race-safety rule.
	if got := allowedTableSources("occupy"); len(got) != 1 || !contains(got, "free") {
		t.Fatalf("occupy must allow only free, got %v", got)
	}
	if got := allowedTableSources("reserve"); len(got) != 1 || !contains(got, "free") {
		t.Fatalf("reserve must allow only free, got %v", got)
	}
	// Release accepts every non-free working state.
	for _, s := range []string{"occupied", "reserved", "dirty"} {
		if !contains(allowedTableSources("release"), s) {
			t.Fatalf("release must allow %q", s)
		}
	}
	if contains(allowedTableSources("release"), "free") {
		t.Fatal("release of a free table is a no-op and must not claim success")
	}
	if got := allowedTableSources("dirty"); len(got) != 1 || !contains(got, "occupied") {
		t.Fatalf("dirty must allow only occupied, got %v", got)
	}
	if allowedTableSources("bogus") != nil {
		t.Fatal("unknown action must have no sources")
	}
}

func TestIsTableConflict(t *testing.T) {
	conflict := map[string]error{
		"occupy race":  ErrTableNotAvailable,
		"wrapped race": errors.Join(ErrTableNotAvailable, errors.New("table is \"occupied\"")),
	}
	for name, err := range conflict {
		if !IsTableConflict(err) {
			t.Fatalf("%s should be a conflict", name)
		}
	}
	for name, err := range map[string]error{
		"missing table": ErrTableNotFound,
		"nil":           nil,
		"other":         errors.New("connection refused"),
	} {
		if IsTableConflict(err) {
			t.Fatalf("%s must not be a conflict", name)
		}
	}
}
