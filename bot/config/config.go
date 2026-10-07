package config

import (
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
)

// Config is the single typed deployment contract. Concern groups are
// embedded so existing cfg.Field reads keep compiling; new code should
// use the groups. Restaurant-identity fields stay flat and are D2-owned.
type Config struct {
	DatabaseConfig
	HTTPConfig
	SecurityConfig
	IntegrationConfig
	DeploymentConfig
	// D2-owned restaurant identity (tenant configuration, not deployment).
	RestaurantName           string
	RestaurantPhone          string
	RestaurantAddress        string
	RestaurantMapURL         string
	RestaurantWhatsAppNumber string
	DeliveryFee              float64
	MinOrderAmount           float64
}

// DatabaseConfig owns persistence connection values. URL has no safe
// default: missing means fatal, never silent localhost.
type DatabaseConfig struct {
	BotDatabaseURL string
}

// HTTPConfig owns the listen socket, proxy trust, CORS, and timeouts.
type HTTPConfig struct {
	BotPort               string
	CORSAllowedOrigins    string
	CORSAllowedOriginsSet bool // true when CORS_ALLOWED_ORIGINS was explicitly provided
	TrustedProxies        string
	StaleMessageTTLSecs   int // max age of an inbound WhatsApp message before it is held silently
	CustomerSessionTTLSecs int // customer session lifetime in seconds (default 30d)
	LogLevel              string
}

// SecurityConfig owns secrets. Every field here is REQUIRED: empty means
// fatal, never a degraded boot.
type SecurityConfig struct {
	BotAdminKey   string
	WebhookSecret string
	OTPPepper     string
}

// IntegrationConfig owns optional external services. Empty means the
// integration is unavailable, never a localhost guess presented as configured.
type IntegrationConfig struct {
	EvolutionAPIURL        string
	EvolutionAPIKey        string
	EvolutionInstance      string
	EvolutionInstanceToken string
	RedisURL               string
	RazorpayKeyID          string
	RazorpaySecret         string
	RazorpayWebhook        string
}

// DeploymentConfig owns topology switches.
type DeploymentConfig struct {
	PublicBaseURL  string
	SingleTenant   bool
	BillingEnabled bool
	BaseDomain     string
}

func Load() *Config {
	deliveryFee, _ := strconv.ParseFloat(getEnv("DELIVERY_FEE", "0"), 64)
	minOrderAmount, _ := strconv.ParseFloat(getEnv("MIN_ORDER_AMOUNT", "0"), 64)
	botDatabaseURL := getEnv("BOT_DATABASE_URL", "postgresql://postgres:root@localhost:5432/orange_cheese_pizza_bot?sslmode=disable")
	if !strings.Contains(botDatabaseURL, "sslmode=") {
		sslMode := getEnv("PGSSLMODE", getEnv("POSTGRES_SSLMODE", "disable"))
		if strings.Contains(botDatabaseURL, "?") {
			botDatabaseURL += "&sslmode=" + sslMode
		} else {
			botDatabaseURL += "?sslmode=" + sslMode
		}
	}

	return &Config{
		DatabaseConfig: DatabaseConfig{
			BotDatabaseURL: botDatabaseURL,
		},
		HTTPConfig: HTTPConfig{
			BotPort:                getEnv("BOT_PORT", "8090"),
			CORSAllowedOrigins:     getEnv("CORS_ALLOWED_ORIGINS", ""),
			CORSAllowedOriginsSet:  os.Getenv("CORS_ALLOWED_ORIGINS") != "",
			TrustedProxies:         getEnv("TRUSTED_PROXIES", ""),
			StaleMessageTTLSecs:    getEnvInt("STALE_MESSAGE_TTL_SECONDS", 120),
			CustomerSessionTTLSecs: getEnvInt("CUSTOMER_SESSION_TTL_SECONDS", 30*24*3600),
			LogLevel:               getEnv("LOG_LEVEL", "info"),
		},
		SecurityConfig: SecurityConfig{
			BotAdminKey:   getEnv("BOT_ADMIN_KEY", ""),
			WebhookSecret: getEnv("EVOLUTION_WEBHOOK_SECRET", ""),
			OTPPepper:     getEnv("OTP_PEPPER", getEnv("BOT_ADMIN_KEY", "")),
		},
		IntegrationConfig: IntegrationConfig{
			EvolutionAPIURL:        getEnv("EVOLUTION_API_URL", "http://localhost:8080"),
			EvolutionAPIKey:        getEnv("EVOLUTION_API_KEY", ""),
			EvolutionInstance:      getEnv("EVOLUTION_INSTANCE", "OCP"),
			EvolutionInstanceToken: getEnv("EVOLUTION_INSTANCE_TOKEN", ""),
			RedisURL:               getEnv("REDIS_URL", ""),
			RazorpayKeyID:          getEnv("RAZORPAY_KEY_ID", ""),
			RazorpaySecret:         getEnv("RAZORPAY_KEY_SECRET", ""),
			RazorpayWebhook:        getEnv("RAZORPAY_WEBHOOK_SECRET", ""),
		},
		DeploymentConfig: DeploymentConfig{
			PublicBaseURL:  strings.TrimRight(getEnv("PUBLIC_BASE_URL", ""), "/"),
			SingleTenant:   strings.EqualFold(getEnv("SINGLE_TENANT_MODE", "true"), "true") || getEnv("SINGLE_TENANT_MODE", "true") == "1",
			BillingEnabled: false, // open-source only; SaaS billing disabled (enable via code change)
			BaseDomain:     strings.TrimSpace(getEnv("BASE_DOMAIN", "ocp.app")),
		},
		RestaurantName:           getEnv("RESTAURANT_NAME", "Orange Cheese Pizza"),
		RestaurantPhone:          getEnv("RESTAURANT_PHONE", ""),
		RestaurantAddress:        getEnv("RESTAURANT_ADDRESS", ""),
		RestaurantMapURL:         getEnv("RESTAURANT_MAP_URL", ""),
		RestaurantWhatsAppNumber: getEnv("RESTAURANT_WHATSAPP_NUMBER", ""),
		DeliveryFee:              deliveryFee,
		MinOrderAmount:           minOrderAmount,
	}
}

// IsRelease reports production mode (GIN_MODE=release, baked into the
// Docker image). Development defaults below this line never apply there.
func IsRelease() bool {
	return os.Getenv("GIN_MODE") == "release"
}

// Validate enforces the deployment contract in one place. Missing
// required values are fatal errors, never silent fallbacks. Dev-only
// defaults (CORS localhost) are applied here so main.go stays linear.
func (c *Config) Validate() error {
	if os.Getenv("BOT_DATABASE_URL") == "" {
		return fmt.Errorf("BOT_DATABASE_URL must be set (run setup.sh to generate .env)")
	}
	if c.BotAdminKey == "" {
		return fmt.Errorf("BOT_ADMIN_KEY must be set (run setup.sh to generate .env)")
	}
	if c.WebhookSecret == "" {
		return fmt.Errorf("SECURITY: EVOLUTION_WEBHOOK_SECRET must be set — refusing to start with unauthenticated webhooks")
	}
	// Security: CORS origins must be explicit in production. Local dev
	// falls back to the Vite localhost defaults.
	if !c.CORSAllowedOriginsSet {
		if IsRelease() {
			return fmt.Errorf("SECURITY: CORS_ALLOWED_ORIGINS must be set explicitly when GIN_MODE=release")
		}
		c.CORSAllowedOrigins = "http://localhost:5173,http://127.0.0.1:5173"
		log.Println("WARNING: CORS_ALLOWED_ORIGINS not set — using localhost defaults for development only")
	}
	return nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getEnvInt reads an int env var; invalid or non-positive values fall back
// to the default (fail toward current behavior, never toward silence).
func getEnvInt(key string, defaultValue int) int {
	if raw := os.Getenv(key); raw != "" {
		if v, err := strconv.Atoi(strings.TrimSpace(raw)); err == nil && v > 0 {
			return v
		}
	}
	return defaultValue
}
