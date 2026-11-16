package database

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// migrationsTableName tracks which migration FILES were applied so each
// runs exactly once over the life of the database. Seed-style files must
// therefore be internally idempotent (they are: ON CONFLICT/upserts),
// and legacy non-idempotent seeds (002) can never re-insert duplicates.
const migrationsTableName = "schema_migrations"

func ensureTracker() error {
	_, err := DB.Exec(`
		CREATE TABLE IF NOT EXISTS ` + migrationsTableName + ` (
			name       VARCHAR(255) PRIMARY KEY,
			applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
	return err
}

func isApplied(name string) (bool, error) {
	var exists bool
	err := DB.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM `+migrationsTableName+` WHERE name=$1)`,
		name).Scan(&exists)
	return exists, err
}

func markApplied(tx *sql.Tx, name string) error {
	_, err := tx.Exec(
		`INSERT INTO `+migrationsTableName+` (name) VALUES ($1) ON CONFLICT DO NOTHING`,
		name)
	return err
}

func RunMigrations() error {
	if err := ensureTracker(); err != nil {
		return fmt.Errorf("failed to create %s: %w", migrationsTableName, err)
	}
	// Advisory lock to serialize concurrent runners (multi-replica deploys).
	// Hold the lock on ONE dedicated connection — a session-scoped advisory
	// lock acquired via DB.QueryRow and released via DB.Exec could land on a
	// different pooled connection and never actually be released.
	// Blocking lock with a configurable timeout avoids the old crash-storm
	// where every replica but one called log.Fatalf on STARTUP.
	lockConn, err := DB.Conn(context.Background())
	if err != nil {
		return fmt.Errorf("failed to acquire migration lock connection: %w", err)
	}
	defer lockConn.Close()
	timeoutSecs := 60
	if v, e := strconv.Atoi(os.Getenv("MIGRATION_LOCK_TIMEOUT_SECS")); e == nil && v > 0 {
		timeoutSecs = v
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSecs)*time.Second)
	defer cancel()
	if _, err := lockConn.ExecContext(ctx, `SELECT pg_advisory_lock(87654321)`); err != nil {
		return fmt.Errorf("failed to acquire migration advisory lock within %ds: %w", timeoutSecs, err)
	}
	defer func() {
		_, _ = lockConn.ExecContext(context.Background(), `SELECT pg_advisory_unlock(87654321)`)
	}()

	// Support both run styles: repo root (bot/migrations) and bot/ cwd.
	candidates := []string{"migrations", "bot/migrations"}
	var migrationsDir string
	var entries []os.DirEntry
	for _, dir := range candidates {
		entries, err = os.ReadDir(dir)
		if err == nil {
			migrationsDir = dir
			break
		}
	}
	if migrationsDir == "" {
		return fmt.Errorf("failed to read migrations directory: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		applied, err := isApplied(entry.Name())
		if err != nil {
			return err
		}
		if applied {
			continue // run-once guarantee
		}

		content, err := os.ReadFile(filepath.Join(migrationsDir, entry.Name()))
		if err != nil {
			return fmt.Errorf("failed to read migration %s: %w", entry.Name(), err)
		}
		tx, err := DB.Begin()
		if err != nil {
			return fmt.Errorf("failed to begin transaction for %s: %w", entry.Name(), err)
		}
		if _, err := tx.Exec(string(content)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("failed to execute migration %s: %w", entry.Name(), err)
		}
		if err := markApplied(tx, entry.Name()); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("failed to record migration %s: %w", entry.Name(), err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("failed to commit migration %s: %w", entry.Name(), err)
		}
		log.Printf("migration applied: %s", entry.Name())
	}
	return nil
}
