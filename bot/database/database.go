package database

import (
	"database/sql"
	"fmt"
	"time"

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
	DB.SetMaxOpenConns(cfg.MaxOpenConns)
	DB.SetMaxIdleConns(cfg.MaxIdleConns)
	DB.SetConnMaxLifetime(time.Duration(cfg.ConnMaxLifetimeSecs) * time.Second)
	DB.SetConnMaxIdleTime(time.Duration(cfg.ConnMaxIdleTimeSecs) * time.Second)
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
