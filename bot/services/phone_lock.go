package services

import (
	"context"
	"database/sql"
	"fmt"
	"hash/fnv"
	"os"
	"strconv"
	"sync"

	_ "github.com/lib/pq"
)

// ------------------------------------------------------------------
// Cross-replica per-customer serialisation.
//
// The in-process custLocks map only serialises taps within one replica. With
// N replicas, two taps for the same phone can both read the same conversation
// state and double-create orders. A PostgreSQL advisory lock (session-scoped,
// keyed by a hash of the phone) makes the guard shared across replicas.
// Toggle: PG_PHONE_LOCKS_ENABLED. Pool size: PHONE_LOCK_POOL_SIZE.
// ------------------------------------------------------------------

var phoneLockDB struct {
	sync.Once
	db *sql.DB
}

func phoneLockPool() *sql.DB {
	phoneLockDB.Do(func() {
		dsn := os.Getenv("BOT_DATABASE_URL")
		if dsn == "" {
			return
		}
		db, err := sql.Open("postgres", dsn)
		if err != nil {
			return
		}
		size, err := strconv.Atoi(os.Getenv("PHONE_LOCK_POOL_SIZE"))
		if err != nil || size < 1 || size > 128 {
			size = 8
		}
		db.SetMaxOpenConns(size)
		db.SetMaxIdleConns(size)
		phoneLockDB.db = db
	})
	return phoneLockDB.db
}

func phoneLockKey(phone string) int64 {
	h := fnv.New64a()
	_, _ = h.Write([]byte(phone))
	return int64(h.Sum64() & 0x7fffffffffffffff) // positive bigint
}

// acquirePhoneLock blocks until this phone's cross-replica lock is held.
// Returns a release function; always call it (defer).
func acquirePhoneLock(phone string) (func(), error) {
	if !pgPhoneLocksEnabled() {
		return func() {}, nil
	}
	db := phoneLockPool()
	if db == nil {
		return func() {}, nil // fail open: local lock still applies
	}
	conn, err := db.Conn(context.Background())
	if err != nil {
		return func() {}, nil // fail open under DB pressure
	}
	key := phoneLockKey(phone)
	if _, err := conn.ExecContext(context.Background(), `SELECT pg_advisory_lock($1)`, key); err != nil {
		_ = conn.Close()
		return func() {}, fmt.Errorf("phone advisory lock: %w", err)
	}
	var once sync.Once
	return func() {
		once.Do(func() {
			_, _ = conn.ExecContext(context.Background(), `SELECT pg_advisory_unlock($1)`, key)
			_ = conn.Close()
		})
	}, nil
}
