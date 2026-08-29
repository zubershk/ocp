package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"orangecheesepizza/bot/admin"
	"orangecheesepizza/bot/config"
	"orangecheesepizza/bot/database"
	"orangecheesepizza/bot/handlers"
	"orangecheesepizza/bot/services"
)

const maxRequestBodySize = 1 << 20 // 1 MB

func main() {
	// Load .env — try repo root then bot/ so `go run ./bot` and systemd both work.
	// Production systemd supplies EnvironmentFile, so this is best-effort for dev.
	for _, p := range []string{"bot/.env", ".env", "../bot/.env"} {
		if err := godotenv.Load(p); err == nil {
			log.Printf("Loaded env from %s", p)
			break
		}
	}

	// Load configuration
	cfg := config.Load()

	// Initialize database
	if err := database.Init(cfg); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	// Run migrations
	if err := database.RunMigrations(); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}
	// Seed owner from BOT_ADMIN_KEY if no admin_users yet (SaaS bootstrap)
	admin.EnsureOwnerSeed(cfg)

	// Initialize services
	evolutionClient := services.NewEvolutionClient(cfg)
	menuService := services.NewMenuService()
	cartService := services.NewCartService()
	orderService := services.NewOrderService()
	stateService := services.NewCustomerStateService()
	restaurantConfigService := services.NewRestaurantConfigService()

	// Initialize bot handler
	botHandler := services.NewBotHandler(
		evolutionClient,
		menuService,
		cartService,
		orderService,
		stateService,
		restaurantConfigService,
		cfg,
	)

	// Initialize webhook handler
	webhookHandler := handlers.NewWebhookHandler(botHandler, cfg)

	// Shared website/WhatsApp order service (same PG pricing)
	websiteOrderService := services.NewWebsiteOrderService(menuService, evolutionClient, cfg)

	// Phase 3: stateful WhatsApp conversation engine (same PG menu/orders)
	conversationEngine := services.NewConversationEngine(menuService, websiteOrderService, evolutionClient, cfg)
	webhookHandler.AttachEngine(conversationEngine)

	// Periodic auth cleanup (OTP/session expiry)
	go func() {
		for range time.Tick(15 * time.Minute) {
			services.CleanupExpired()
		}
	}()

	// Initialize admin handler
	adminHandler := admin.NewAdminHandler(menuService, orderService, evolutionClient, cfg)

	// Setup Gin router
	gin.SetMode(gin.ReleaseMode)
	router := gin.Default()
	// Enforce max request body size to prevent OOM via large payloads
	router.Use(func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxRequestBodySize)
		c.Next()
	})
	router.Use(handlers.SecurityHeaders())
	// SaaS media — menu images live here, served to site + bot via /uploads/<file>
	_ = os.MkdirAll("./uploads", 0755)
	router.Static("/uploads", "./uploads")

	// Webhook endpoints — REJECT if secret is not configured (prevents impersonation)
	webhookAuth := func(c *gin.Context) {
		if cfg.WebhookSecret == "" {
			log.Println("SECURITY: EVOLUTION_WEBHOOK_SECRET not set — rejecting webhook")
			c.JSON(500, gin.H{"error": "webhook not configured"})
			c.Abort()
			return
		}
		// Verify via X-Webhook-Secret, X-Api-Key, or apikey header
		provided := c.GetHeader("X-Webhook-Secret")
		if provided == "" {
			provided = c.GetHeader("X-Api-Key")
		}
		if provided == "" {
			provided = c.GetHeader("apikey")
		}
		if provided != cfg.WebhookSecret {
			c.JSON(401, gin.H{"error": "unauthorized"})
			c.Abort()
			return
		}
		c.Next()
	}
	router.POST("/webhook/evolution", webhookAuth, handlers.RateLimit(300, time.Minute), webhookHandler.HandleWebhook)
	router.POST("/webhook/button", webhookAuth, handlers.RateLimit(300, time.Minute), webhookHandler.HandleButtonClick)

	// Public website API
	apiHandler := handlers.NewApiHandler(menuService, websiteOrderService)
	authHandler := handlers.NewAuthHandler(evolutionClient)
	router.Use(handlers.CORSMiddleware(cfg.CORSAllowedOrigins))
	apiGroup := router.Group("/api")
	apiGroup.Use(handlers.RateLimit(120, time.Minute))
	{
		apiGroup.GET("/menu", apiHandler.GetMenu)
		apiGroup.GET("/menu/:id", apiHandler.GetItem)
		apiGroup.GET("/outlets", apiHandler.GetOutlets)
		apiGroup.GET("/config", apiHandler.GetConfig)
		apiGroup.POST("/orders", handlers.RateLimit(20, time.Minute), apiHandler.CreateOrder)
		apiGroup.GET("/orders/:id", apiHandler.GetOrder)
		// Customer auth — phone synced to WhatsApp bot (customers.whatsapp_number)
		apiGroup.POST("/auth/send-otp", handlers.RateLimit(3, time.Minute), authHandler.SendOTP)
		apiGroup.POST("/auth/verify-otp", handlers.RateLimit(10, time.Minute), authHandler.VerifyOTP)
		apiGroup.GET("/auth/me", authHandler.Me)
		apiGroup.POST("/auth/logout", authHandler.Logout)
		apiGroup.GET("/auth/orders", authHandler.Orders)
	}

	// Admin endpoints (protected by admin key)
	adminGroup := router.Group("/admin")
	adminGroup.Use(handlers.RateLimit(60, time.Minute))
	adminGroup.Use(adminHandler.RequireAdminKey())
	{
		adminGroup.GET("/health", adminHandler.Health)
		adminGroup.GET("/menu", adminHandler.GetMenu)
		adminGroup.POST("/menu", adminHandler.RequireRole("owner", "manager"), adminHandler.CreateMenuItem)
		adminGroup.PUT("/menu/:id", adminHandler.RequireRole("owner", "manager"), adminHandler.UpdateMenuItem)
		adminGroup.DELETE("/menu/:id", adminHandler.RequireRole("owner", "manager"), adminHandler.DeleteMenuItem)
		adminGroup.POST("/category", adminHandler.RequireRole("owner", "manager"), adminHandler.CreateCategory)
		adminGroup.GET("/categories", adminHandler.GetCategoriesAdmin)
		adminGroup.POST("/upload", adminHandler.RequireRole("owner", "manager"), adminHandler.UploadImage)
		adminGroup.GET("/outlets", adminHandler.GetOutletsAdmin)
		adminGroup.POST("/outlets", adminHandler.RequireRole("owner", "manager"), adminHandler.CreateOutlet)
		adminGroup.PUT("/outlets/:id", adminHandler.RequireRole("owner", "manager"), adminHandler.UpdateOutlet)
		adminGroup.DELETE("/outlets/:id", adminHandler.RequireRole("owner", "manager"), adminHandler.DeleteOutlet)
		adminGroup.GET("/config", adminHandler.GetConfigAdmin)
		adminGroup.PUT("/config", adminHandler.RequireRole("owner", "manager"), adminHandler.UpdateConfigAdmin)
		// Live chat — bot dashboard
		adminGroup.GET("/conversations", adminHandler.ListConversations)
		adminGroup.GET("/conversations/:phone/messages", adminHandler.GetChatMessages)
		adminGroup.POST("/conversations/:phone/send", adminHandler.RequireRole("owner", "manager", "kitchen"), adminHandler.SendChatMessage)
		adminGroup.POST("/conversations/:phone/state", adminHandler.RequireRole("owner", "manager", "kitchen"), adminHandler.SetConversationState)
		adminGroup.GET("/analytics", adminHandler.GetAnalytics)
		adminGroup.GET("/users", adminHandler.RequireRole("owner"), adminHandler.ListAdminUsers)
		adminGroup.POST("/users", adminHandler.RequireRole("owner"), adminHandler.CreateAdminUser)
		adminGroup.DELETE("/users/:id", adminHandler.RequireRole("owner"), adminHandler.DeleteAdminUser)
		adminGroup.GET("/audit", adminHandler.RequireRole("owner", "manager"), adminHandler.GetAuditLog)
		adminGroup.GET("/me", adminHandler.GetMeAdmin)
		adminGroup.GET("/orders", adminHandler.GetOrders)
		adminGroup.GET("/orders/:id", adminHandler.GetOrder)
		adminGroup.PATCH("/orders/:id/status", adminHandler.RequireRole("owner", "manager", "kitchen"), adminHandler.UpdateOrderStatus)
		adminGroup.GET("/debug/whatsapp/:phone", adminHandler.DebugWhatsApp)
		// Campaign runner integration
		adminGroup.GET("/customers", adminHandler.ListCustomers)
		adminGroup.POST("/broadcast/send", adminHandler.RequireRole("owner", "manager"), adminHandler.BroadcastSend)
	}

	// Health / readiness — SaaS observability
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})
	router.GET("/ready", func(c *gin.Context) {
		if err := database.DB.Ping(); err != nil {
			c.JSON(503, gin.H{"status": "not ready"})
			return
		}
		// Evolution is best-effort — don't fail readiness if WA gateway is down, just report
		evoOk := true
		if _, err := evolutionClient.GetInstanceInfo(); err != nil {
			evoOk = false
		}
		c.JSON(200, gin.H{"status": "ok", "db": "ok", "evolution": map[string]bool{"ok": evoOk}})
	})

	// Start server — SaaS graceful shutdown (drains in-flight orders)
	addr := ":" + cfg.BotPort
	srv := &http.Server{Addr: addr, Handler: router}
	log.Printf("Starting Orange Cheese Pizza Bot on %s", addr)
	log.Printf("Webhook endpoint: http://localhost%s/webhook/evolution", addr)

	// Configure webhook in Evolution GO
	go func() {
		// tiny delay so :8090 is listening before Evolution hits it
		time.Sleep(800 * time.Millisecond)
		if err := evolutionClient.ConfigureWebhook("http://localhost:" + cfg.BotPort + "/webhook/evolution"); err != nil {
			log.Printf("Warning: Failed to configure webhook: %v", err)
		}
	}()

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	// Wait for termination — drain 15s
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down — draining in-flight requests...")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Forced shutdown: %v", err)
	}
	log.Println("Server exited cleanly")
}
