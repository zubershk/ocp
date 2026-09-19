package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
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

	// Security: CORS origins must be explicit in production. GIN_MODE=release
	// (baked into the Docker image) refuses to start without CORS_ALLOWED_ORIGINS;
	// local dev falls back to the Vite localhost defaults.
	if !cfg.CORSAllowedOriginsSet {
		if os.Getenv("GIN_MODE") == "release" {
			log.Fatal("SECURITY: CORS_ALLOWED_ORIGINS must be set explicitly when GIN_MODE=release")
		}
		cfg.CORSAllowedOrigins = "http://localhost:5173,http://127.0.0.1:5173"
		log.Println("WARNING: CORS_ALLOWED_ORIGINS not set — using localhost defaults for development only")
	}

	// Security: webhooks must always be authenticated. Fail fast instead of
	// rejecting per-request — an unset secret is a deploy misconfiguration.
	if cfg.WebhookSecret == "" {
		log.Fatal("SECURITY: EVOLUTION_WEBHOOK_SECRET must be set — refusing to start with unauthenticated webhooks")
	}

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
	// Ensure bootstrap tenant rows exist (idempotent; mirrors 021)
	admin.EnsureTenantBootstrap()

	// Load business config from DB (sizes, payments, icons, delivery fee, etc.)
	services.LoadBusinessConfig()

	// Initialize services
	evolutionClient := services.NewEvolutionClient(cfg)
	menuService := services.NewMenuService()
	cartService := services.NewCartService()
	orderService := services.NewOrderService()
	posOrderService := services.NewPOSOrderService()
	stateService := services.NewCustomerStateService()
	restaurantConfigService := services.NewRestaurantConfigService()
	botMessageService := services.NewBotMessageService()

	// Load brand name from restaurant_config for bot messages
	if rc, _ := restaurantConfigService.GetConfig(); rc != nil && rc.Name != "" {
		botMessageService.SetBrandName(rc.Name)
	} else if cfg.RestaurantName != "" {
		botMessageService.SetBrandName(cfg.RestaurantName)
	} else {
		botMessageService.SetBrandName("Orange Cheese Pizza")
	}

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
	conversationEngine := services.NewConversationEngine(menuService, websiteOrderService, evolutionClient, cfg, botMessageService)
	webhookHandler.AttachEngine(conversationEngine)

	// Periodic auth cleanup (OTP/session expiry)
	go func() {
		for range time.Tick(15 * time.Minute) {
			services.CleanupExpired()
		}
	}()

	// Initialize admin handler
	adminHandler := admin.NewAdminHandler(menuService, orderService, posOrderService, evolutionClient, cfg)
	admin.SetBotMessageService(botMessageService)

	// Site settings handler
	siteHandler := handlers.NewSiteSettingsHandler()
	reviewHandler := handlers.NewReviewHandler()
	provisionHandler := handlers.NewProvisioningHandler()

	// Setup Gin router
	gin.SetMode(gin.ReleaseMode)
	router := gin.Default()
	// Trusted proxies from env (comma-separated CIDRs/hosts)
	if cfg.TrustedProxies != "" {
		_ = router.SetTrustedProxies(strings.Split(cfg.TrustedProxies, ","))
	}
	// X-Request-ID for observability
	router.Use(func(c *gin.Context) {
		rid := c.GetHeader("X-Request-ID")
		if rid == "" {
			rid = fmt.Sprintf("%d-%d", time.Now().UnixNano(), os.Getpid())
		}
		c.Set("requestID", rid)
		c.Header("X-Request-ID", rid)
		c.Next()
	})
	// Enforce max request body size to prevent OOM via large payloads.
	// Image uploads get a higher cap; UploadImage enforces 5MB itself.
	router.Use(func(c *gin.Context) {
		limit := int64(maxRequestBodySize)
		if c.FullPath() == "/admin/upload" || c.Request.URL.Path == "/admin/upload" {
			limit = 6 << 20 // 5MB image + multipart overhead
		}
		if c.FullPath() == "/admin/broadcast/send" || c.Request.URL.Path == "/admin/broadcast/send" {
			limit = 8 << 20 // base64 inline media (~5MB file -> ~6.8MB)
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
		c.Next()
	})
	router.Use(handlers.SecurityHeaders())
	router.Use(services.TenantResolverMiddleware(cfg.BaseDomain, cfg.TrustedProxies))
	// Open-source media — tenant-aware: ./uploads/<restaurant_id>/<file>
	_ = os.MkdirAll("./uploads", 0755)
	router.Static("/uploads", "./uploads")

	// Webhook endpoints — the bundled Evolution GO fork sends no auth
	// headers, so local Evolution instances in dev are trusted by source IP
	// while every other sender must present the secret. In production
	// (GIN_MODE=release) loopback callers must authenticate too — shared-host
	// adjacency is not a trust boundary.
	webhookAuth := func(c *gin.Context) {
		if os.Getenv("GIN_MODE") != "release" {
			if ip := net.ParseIP(c.ClientIP()); ip != nil && ip.IsLoopback() {
				c.Next()
				return
			}
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
	// Provisioning (open-source, no auth): create tenant
	router.POST("/api/signup", provisionHandler.Signup)
	router.POST("/api/orgs", provisionHandler.Signup)
	// Domain-aware public routes need tenant resolver; already global above
	apiGroup := router.Group("/api")
	apiGroup.Use(handlers.RateLimit(120, time.Minute))
	{
		apiGroup.GET("/menu", apiHandler.GetMenu)
		apiGroup.GET("/menu/:id", apiHandler.GetItem)
		apiGroup.GET("/outlets", apiHandler.GetOutlets)
		apiGroup.GET("/config", apiHandler.GetConfig)
		apiGroup.GET("/crusts", apiHandler.GetCrusts)
		apiGroup.GET("/business-config", func(c *gin.Context) {
			if rid, err := services.RequireRestaurant(c); err == nil {
				c.JSON(200, services.GetBizConfigFor(rid))
				return
			}
			c.JSON(200, services.GetBizConfig())
		})
		apiGroup.GET("/site-settings", siteHandler.GetSiteSettings)
		apiGroup.GET("/site-pages/:slug", siteHandler.GetPage)
		apiGroup.GET("/menu-categories", siteHandler.GetMenuCategories)
		apiGroup.GET("/offers", siteHandler.GetOffersPublic)
		apiGroup.GET("/banners", siteHandler.GetBannersPublic)
		apiGroup.GET("/family-packs", siteHandler.GetFamilyPacksPublic)
		apiGroup.GET("/reviews", reviewHandler.ListReviews)
		apiGroup.GET("/reviews/summary", reviewHandler.ReviewSummary)
		apiGroup.POST("/reviews", reviewHandler.CreateReview)
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
	// Tenant context for every admin call. Handlers ignore these keys
	// until PR 3 scopes them; behavior is unchanged in PR 2.
	adminGroup.Use(admin.TenantMiddleware())
	{
		adminGroup.GET("/health", adminHandler.Health)
		adminGroup.GET("/tenant/context", adminHandler.GetTenantContext)
		adminGroup.GET("/menu", adminHandler.GetMenu)
		adminGroup.POST("/menu", adminHandler.RequireRole("owner", "manager"), adminHandler.RequirePermission("menu.update"), adminHandler.CreateMenuItem)
		adminGroup.PUT("/menu/:id", adminHandler.RequireRole("owner", "manager"), adminHandler.RequirePermission("menu.update"), adminHandler.UpdateMenuItem)
		adminGroup.DELETE("/menu/:id", adminHandler.RequireRole("owner", "manager"), adminHandler.RequirePermission("menu.update"), adminHandler.DeleteMenuItem)
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
		adminGroup.GET("/orders", adminHandler.RequirePermission("orders.view"), adminHandler.GetOrders)
		adminGroup.GET("/orders/:id", adminHandler.RequirePermission("orders.view"), adminHandler.GetOrder)
		adminGroup.PATCH("/orders/:id/status", adminHandler.RequireRole("owner", "manager", "kitchen"), adminHandler.RequirePermission("orders.update"), adminHandler.UpdateOrderStatus)
		// Campaign runner integration
		adminGroup.GET("/customers", adminHandler.RequireRole("owner", "manager"), adminHandler.ListCustomers)
		adminGroup.POST("/broadcast/send", adminHandler.RequireRole("owner", "manager"), adminHandler.BroadcastSend)
		// Site settings admin endpoints
		adminGroup.GET("/site-settings", siteHandler.GetSiteSettingsAdmin)
		adminGroup.PUT("/site-settings/:key", siteHandler.UpdateSiteSetting)
		adminGroup.GET("/site-pages", siteHandler.ListPages)
		adminGroup.GET("/site-pages/:slug", siteHandler.GetPageAdmin)
		adminGroup.PUT("/site-pages/:slug", siteHandler.UpsertPage)
		adminGroup.DELETE("/site-pages/:slug", siteHandler.DeletePage)
		adminGroup.GET("/menu-categories", siteHandler.GetMenuCategoriesAdmin)
		adminGroup.POST("/menu-categories", siteHandler.CreateCategory)
		adminGroup.PUT("/menu-categories/:id", siteHandler.UpdateCategory)
		adminGroup.DELETE("/menu-categories/:id", siteHandler.DeleteCategory)
		adminGroup.GET("/offers", siteHandler.GetOffers)
		adminGroup.PUT("/offers", siteHandler.UpdateOffers)
		adminGroup.GET("/banners", siteHandler.GetBanners)
		adminGroup.PUT("/banners", siteHandler.UpdateBanners)
		adminGroup.GET("/family-packs", siteHandler.GetFamilyPacks)
		adminGroup.PUT("/family-packs", siteHandler.UpdateFamilyPacks)
		adminGroup.GET("/events/stream", func(c *gin.Context) { services.StreamEvents(c) })
		adminGroup.GET("/uploads", adminHandler.ListUploads)
		adminGroup.DELETE("/uploads/:name", adminHandler.RequireRole("owner", "manager"), adminHandler.DeleteUpload)
		adminGroup.GET("/reviews", reviewHandler.ListReviewsAdmin)
		adminGroup.PATCH("/reviews/:id", adminHandler.RequireRole("owner", "manager"), reviewHandler.ModerateReview)
		// Bot message templates
		adminGroup.GET("/bot-messages", adminHandler.ListBotMessages)
		adminGroup.GET("/bot-messages/:key", adminHandler.GetBotMessage)
		adminGroup.PUT("/bot-messages/:key", adminHandler.RequireRole("owner", "manager"), adminHandler.UpdateBotMessage)
		adminGroup.POST("/bot-messages/reset/:key", adminHandler.RequireRole("owner", "manager"), adminHandler.ResetBotMessage)
		adminGroup.POST("/bot-messages/reset-all", adminHandler.RequireRole("owner"), adminHandler.ResetAllBotMessages)
		adminGroup.POST("/bot-messages/preview/:key", adminHandler.RenderBotMessagePreview)
		// Business configuration (sizes, payments, icons, delivery, etc.)
		adminGroup.GET("/business-config", adminHandler.GetBusinessConfig)
		adminGroup.PUT("/business-config", adminHandler.RequireRole("owner", "manager"), adminHandler.UpdateBusinessConfig)
		adminGroup.POST("/business-config/reload", adminHandler.RequireRole("owner"), adminHandler.ReloadBusinessConfig)
		// Crust management
		adminGroup.GET("/crusts", adminHandler.GetCrustsAdmin)
		adminGroup.POST("/crusts", adminHandler.RequireRole("owner", "manager"), adminHandler.CreateCrust)
		adminGroup.PUT("/crusts/:id", adminHandler.RequireRole("owner", "manager"), adminHandler.UpdateCrust)
		adminGroup.DELETE("/crusts/:id", adminHandler.RequireRole("owner", "manager"), adminHandler.DeleteCrust)
		// POS endpoints — guarded by pos.* permissions (matrix in
		// services.POSRoleGrants, seeded by migration 026). Owner
		// bypasses permission checks via RequirePermission.
		adminGroup.GET("/pos/menu", adminHandler.RequirePermission("pos.read"), adminHandler.GetPOSMenu)
		adminGroup.POST("/pos/orders", adminHandler.RequireRole("owner", "manager", "cashier"), adminHandler.RequirePermission("pos.create_order"), adminHandler.CreatePOSOrder)
		adminGroup.GET("/pos/orders/:id", adminHandler.RequirePermission("pos.read"), adminHandler.GetPOSOrder)
		adminGroup.PATCH("/pos/orders/:id", adminHandler.RequireRole("owner", "manager", "cashier"), adminHandler.RequirePermission("pos.update_order"), adminHandler.UpdatePOSOrder)
		adminGroup.POST("/pos/orders/:id/hold", adminHandler.RequireRole("owner", "manager", "cashier"), adminHandler.RequirePermission("pos.update_order"), adminHandler.HoldPOSOrder)
		adminGroup.POST("/pos/orders/:id/resume", adminHandler.RequireRole("owner", "manager", "cashier"), adminHandler.RequirePermission("pos.update_order"), adminHandler.ResumePOSOrder)
		adminGroup.POST("/pos/orders/:id/complete", adminHandler.RequireRole("owner", "manager", "cashier"), adminHandler.RequirePermission("pos.update_order"), adminHandler.CompletePOSOrder)
		adminGroup.POST("/pos/orders/:id/cancel", adminHandler.RequireRole("owner", "manager"), adminHandler.RequirePermission("pos.update_order"), adminHandler.CancelPOSOrder)
		adminGroup.POST("/pos/orders/:id/payments", adminHandler.RequireRole("owner", "manager", "cashier"), adminHandler.RequirePermission("pos.take_payment"), adminHandler.TakePaymentPOSOrder)
		adminGroup.POST("/pos/orders/:id/refunds", adminHandler.RequireRole("owner", "manager"), adminHandler.RequirePermission("pos.refund"), adminHandler.RefundPOSOrder)
		adminGroup.GET("/pos/tables", adminHandler.RequirePermission("pos.read"), adminHandler.GetPOSOrderTables)
		adminGroup.PATCH("/pos/tables/:id", adminHandler.RequireRole("owner", "manager"), adminHandler.RequirePermission("pos.manage_tables"), adminHandler.AssignTableToOrder)
		adminGroup.GET("/pos/discounts", adminHandler.RequirePermission("pos.read"), adminHandler.GetPOSDiscounts)
		adminGroup.POST("/pos/discounts", adminHandler.RequireRole("owner", "manager"), adminHandler.RequirePermission("pos.apply_discount"), adminHandler.ApplyPOSDiscount)
		adminGroup.DELETE("/pos/discounts/:id", adminHandler.RequireRole("owner", "manager"), adminHandler.RequirePermission("pos.apply_discount"), adminHandler.RemovePOSDiscount)
		adminGroup.GET("/pos/price", adminHandler.RequirePermission("pos.read"), adminHandler.CalculatePOSPrice)
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

	// Configure webhook in Evolution GO — use Docker service hostname when running in compose
	go func() {
		time.Sleep(800 * time.Millisecond)
		webhookURL := "http://localhost:" + cfg.BotPort + "/webhook/evolution"
		// In Docker, Evolution reaches bot via service name "bot", not localhost
		if os.Getenv("EVOLUTION_API_URL") == "http://evolution:8080" || strings.Contains(cfg.EvolutionAPIURL, "evolution:") {
			webhookURL = "http://bot:" + cfg.BotPort + "/webhook/evolution"
		}
		if cfg.PublicBaseURL != "" {
			webhookURL = strings.TrimRight(cfg.PublicBaseURL, "/") + "/webhook/evolution"
		}
		if err := evolutionClient.ConfigureWebhook(webhookURL); err != nil {
			log.Printf("Warning: Failed to configure webhook (%s): %v", webhookURL, err)
		} else {
			log.Printf("Webhook configured: %s", webhookURL)
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
