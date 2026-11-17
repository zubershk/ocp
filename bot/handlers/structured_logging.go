package handlers

import (
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// Structured request logging with request ID + tenant context.
// Set LOG_FORMAT=json (default in production) for machine-parsable logs,
// or LOG_FORMAT=text for human-readable local dev. LOG_LEVEL controls verbosity.
func InitLogger() {
	level := slog.LevelInfo
	switch strings.ToLower(strings.TrimSpace(os.Getenv("LOG_LEVEL"))) {
	case "debug":
		level = slog.LevelDebug
	case "warn", "warning":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	}
	opts := &slog.HandlerOptions{Level: level}
	var h slog.Handler
	if strings.EqualFold(strings.TrimSpace(os.Getenv("LOG_FORMAT")), "text") {
		h = slog.NewTextHandler(os.Stdout, opts)
	} else {
		h = slog.NewJSONHandler(os.Stdout, opts)
	}
	slog.SetDefault(slog.New(h))
}

// StructuredLogging emits one structured line per request with correlation
// fields. The existing request-ID middleware must run BEFORE this one.
func StructuredLogging() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		status := c.Writer.Status()
		level := slog.LevelInfo
		if status >= 500 {
			level = slog.LevelError
		} else if status >= 400 {
			level = slog.LevelWarn
		}
		route := c.FullPath()
		if route == "" {
			route = c.Request.URL.Path
		}
		slog.Log(c.Request.Context(), level, "http request",
			"request_id", c.GetString("requestID"),
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"route", route,
			"status", status,
			"duration_ms", time.Since(start).Milliseconds(),
			"client_ip", c.ClientIP(),
			"restaurant_id", c.GetInt("restaurantID"),
		)
		if len(c.Errors) > 0 {
			slog.Warn("request errors", "request_id", c.GetString("requestID"), "errors", c.Errors.String())
		}
	}
}

// Log info helpers used by other packages via the default logger.
func LogInfo(msg string, attrs ...any)  { slog.Info(msg, attrs...) }
func LogWarn(msg string, attrs ...any)  { slog.Warn(msg, attrs...) }
func LogError(msg string, attrs ...any) { slog.Error(msg, attrs...) }
