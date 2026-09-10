package services

import (
	"database/sql"
	"os"
	"sync"
	"testing"

	_ "github.com/lib/pq"
	"orangecheesepizza/bot/database"
)

// ------------------------------------------------------------------
// Staging harness for POS acceptance (PR 5 merge gate).
//
// These tests run only against a live migrated PostgreSQL:
//
//	OCP_TEST_DATABASE_URL (preferred) or BOT_DATABASE_URL
//
// Without either they skip, keeping unit CI DB-free. stagingDB
// applies every migration once (021 through 026), so the suite
// exercises the real schema: CHECKs, UNIQUEs, FKs, and locks.
// Run packages sequentially (go test -p 1 ./...) since the harness
// chdirs to locate the migrations directory.
// ------------------------------------------------------------------

var stagingMigrateOnce sync.Once

// stagingDB connects to staging Postgres, migrates, and swaps in
// database.DB for the test, restoring it afterwards.
func stagingDB(t *testing.T) {
	t.Helper()
	dsn := os.Getenv("OCP_TEST_DATABASE_URL")
	if dsn == "" {
		dsn = os.Getenv("BOT_DATABASE_URL")
	}
	if dsn == "" {
		t.Skip("no staging DB: set OCP_TEST_DATABASE_URL to run POS staging tests")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("open staging DB: %v", err)
	}
	if err := db.Ping(); err != nil {
		t.Fatalf("ping staging DB: %v", err)
	}
	old := database.DB
	database.DB = db
	t.Cleanup(func() {
		database.DB = old
		_ = db.Close()
	})
	stagingMigrateOnce.Do(func() {
		cwd, err := os.Getwd()
		if err != nil {
			t.Fatalf("getwd: %v", err)
		}
		// Tests execute with cwd=bot/services; migrations live one up.
		if err := os.Chdir("../"); err != nil {
			t.Fatalf("chdir to bot/: %v", err)
		}
		defer func() {
			_ = os.Chdir(cwd)
		}()
		if err := database.RunMigrations(); err != nil {
			t.Fatalf("run staging migrations: %v", err)
		}
	})
}
