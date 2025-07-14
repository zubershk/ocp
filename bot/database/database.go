package database

import (
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"
	"orangecheesepizza/bot/config"
)

var DB *sql.DB

func Init(cfg *config.Config) error {
	var err error
	DB, err = sql.Open("postgres", cfg.BotDatabaseURL)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}
	DB.SetMaxOpenConns(20)
	DB.SetMaxIdleConns(5)
	DB.SetConnMaxLifetime(5 * 60 * 1e9) // 5m
	DB.SetConnMaxIdleTime(2 * 60 * 1e9) // 2m
	if err = DB.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}
	return nil
}

func Close() error {
	if DB != nil {
		return DB.Close()
	}
	return nil
}
