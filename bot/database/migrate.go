package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
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

	// Support both run styles: repo root (bot/migrations) and bot/ cwd.
	candidates := []string{"migrations", "bot/migrations"}
	var migrationsDir string
	var entries []os.DirEntry
	var err error
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
		if _, err := DB.Exec(string(content)); err != nil {
			return fmt.Errorf("failed to execute migration %s: %w", entry.Name(), err)
		}
		if _, err := DB.Exec(
			`INSERT INTO `+migrationsTableName+` (name) VALUES ($1) ON CONFLICT DO NOTHING`,
			entry.Name()); err != nil {
			return fmt.Errorf("failed to record migration %s: %w", entry.Name(), err)
		}
		log.Printf("migration applied: %s", entry.Name())
	}
	return nil
}
