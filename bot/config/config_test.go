package config

import (
	"os"
	"testing"
)

func setRequiredEnv(t *testing.T) {
	t.Helper()
	t.Setenv("BOT_DATABASE_URL", "postgresql://ocp:test@localhost:5432/ocp?sslmode=disable")
	t.Setenv("BOT_ADMIN_KEY", "test-key")
	t.Setenv("EVOLUTION_WEBHOOK_SECRET", "test-secret")
	t.Setenv("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
}

func TestValidateRequiresDeploymentValues(t *testing.T) {
	os.Unsetenv("BOT_DATABASE_URL")
	os.Unsetenv("BOT_ADMIN_KEY")
	os.Unsetenv("EVOLUTION_WEBHOOK_SECRET")
	os.Unsetenv("CORS_ALLOWED_ORIGINS")

	cfg := Load()
	if err := cfg.Validate(); err == nil {
		t.Fatal("empty deployment config must fail validation, not silently boot")
	}

	setRequiredEnv(t)
	cfg = Load()
	if err := cfg.Validate(); err != nil {
		t.Fatalf("complete deployment config must validate: %v", err)
	}
}

func TestValidateCORSReleaseRule(t *testing.T) {
	setRequiredEnv(t)
	os.Unsetenv("CORS_ALLOWED_ORIGINS")
	t.Setenv("GIN_MODE", "release")
	cfg := Load()
	if err := cfg.Validate(); err == nil {
		t.Fatal("release without CORS origins must fail validation")
	}

	os.Unsetenv("GIN_MODE")
	cfg = Load()
	if err := cfg.Validate(); err != nil {
		t.Fatalf("dev without CORS origins must fall back, not fail: %v", err)
	}
	if cfg.CORSAllowedOrigins == "" {
		t.Fatal("dev fallback must set explicit localhost origins")
	}
}

func TestEmbeddedGroupsPreserveFlatReads(t *testing.T) {
	setRequiredEnv(t)
	os.Unsetenv("BOT_PORT")
	cfg := Load()
	if cfg.BotPort != "8090" {
		t.Fatalf("promoted BotPort must read 8090, got %q", cfg.BotPort)
	}
	if cfg.BotDatabaseURL == "" || cfg.BotAdminKey == "" || cfg.WebhookSecret == "" {
		t.Fatal("promoted security/database fields must be readable")
	}
}
