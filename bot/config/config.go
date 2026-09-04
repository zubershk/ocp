package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	BotPort                  string
	BotDatabaseURL           string
	EvolutionAPIURL          string
	EvolutionAPIKey          string
	EvolutionInstance        string
	EvolutionInstanceToken   string
	BotAdminKey              string
	RestaurantName           string
	RestaurantPhone          string
	RestaurantAddress        string
	RestaurantMapURL         string
	RestaurantWhatsAppNumber string
	DeliveryFee              float64
	MinOrderAmount           float64
	LogLevel                 string
	CORSAllowedOrigins       string
	WebhookSecret            string
	PublicBaseURL            string
}

func Load() *Config {
	deliveryFee, _ := strconv.ParseFloat(getEnv("DELIVERY_FEE", "0"), 64)
	minOrderAmount, _ := strconv.ParseFloat(getEnv("MIN_ORDER_AMOUNT", "0"), 64)

	return &Config{
		BotPort:                  getEnv("BOT_PORT", "8090"),
		BotDatabaseURL:           getEnv("BOT_DATABASE_URL", "postgresql://postgres:root@localhost:5432/orange_cheese_pizza_bot?sslmode=disable"),
		EvolutionAPIURL:          getEnv("EVOLUTION_API_URL", "http://localhost:8080"),
		EvolutionAPIKey:          getEnv("EVOLUTION_API_KEY", ""),
		EvolutionInstance:        getEnv("EVOLUTION_INSTANCE", "OCP"),
		EvolutionInstanceToken:   getEnv("EVOLUTION_INSTANCE_TOKEN", ""),
		BotAdminKey:              getEnv("BOT_ADMIN_KEY", ""),
		RestaurantName:           getEnv("RESTAURANT_NAME", "Orange Cheese Pizza"),
		RestaurantPhone:          getEnv("RESTAURANT_PHONE", ""),
		RestaurantAddress:        getEnv("RESTAURANT_ADDRESS", ""),
		RestaurantMapURL:         getEnv("RESTAURANT_MAP_URL", ""),
		RestaurantWhatsAppNumber: getEnv("RESTAURANT_WHATSAPP_NUMBER", ""),
		DeliveryFee:              deliveryFee,
		MinOrderAmount:           minOrderAmount,
		LogLevel:                 getEnv("LOG_LEVEL", "info"),
		CORSAllowedOrigins:       getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"),
		WebhookSecret:            getEnv("EVOLUTION_WEBHOOK_SECRET", ""),
		PublicBaseURL:            strings.TrimRight(getEnv("PUBLIC_BASE_URL", ""), "/"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
