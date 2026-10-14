// Package logger provides a flexible and configurable logging solution with support for
// different log levels, colored output, and webhook notifications.
package logger

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"
)

// LogLevel represents the severity level of a log message
type LogLevel string

const (
	// INFO represents informational messages
	INFO LogLevel = "INFO"
	// ERR represents error messages
	ERR LogLevel = "ERR"
	// WARN represents warning messages
	WARN LogLevel = "WARN"
	// DEBUG represents debug messages
	DEBUG LogLevel = "DEBUG"
)

// WebhookConfig defines the configuration for webhook notifications
type WebhookConfig struct {
	// URL is the endpoint where log messages will be sent
	URL string `json:"url"`
	// SendError determines if error logs should trigger webhook notifications
	SendError bool `json:"sendError"`
	// SendFatal determines if fatal logs should trigger webhook notifications
	SendFatal bool `json:"sendFatal"`
	// SendWarn determines if warning logs should trigger webhook notifications
	SendWarn bool `json:"sendWarn"`
}

// Logger is the main logging structure that provides methods for different log levels
type Logger struct {
	// ServiceName identifies the service generating the logs
	ServiceName string
	// LogContextName provides additional context for the logs
	LogContextName string
	// DebugEnabled controls whether debug messages are logged
	DebugEnabled bool
	// CaptureExceptionFunc is an optional callback for error handling
	CaptureExceptionFunc func(err error)
	// WebhookConfig contains settings for webhook notifications
	WebhookConfig WebhookConfig
}

// NewLogger creates a new Logger instance with the given configuration
func NewLogger(serviceName, logContextName string, debugEnabled bool, webhookConfig WebhookConfig) *Logger {
	return &Logger{
		ServiceName:    serviceName,
		LogContextName: logContextName,
		DebugEnabled:   debugEnabled,
		WebhookConfig:  webhookConfig,
	}
}

// Log sends a log message with the specified level and format
func (l *Logger) Log(logLevel LogLevel, format string, v ...any) {
	if logLevel == DEBUG && !l.DebugEnabled {
		return
	}

	var prefix string
	switch logLevel {
	case ERR:
		prefix += "\033[41m[ERR]\033[0m "
	case WARN:
		prefix += "\033[43m[WARN]\033[0m "
	case DEBUG:
		prefix += "\033[40m\033[37m[DEBUG]\033[0m "
	default:
		prefix += "\033[44m[INFO]\033[0m "
	}
	servicePrefix := fmt.Sprintf("\033[35m[%s]\033[0m ", l.ServiceName)
	prefix = servicePrefix + prefix + format
	log.Printf(prefix, v...)
}

// LogInfo sends an informational log message
func (l *Logger) LogInfo(format string, v ...any) {
	l.Log(INFO, format, v...)
}

// LogError sends an error log message and optionally triggers webhook and exception capture
func (l *Logger) LogError(format string, v ...any) {
	err := fmt.Errorf(format, v...)
	if l.CaptureExceptionFunc != nil {
		l.CaptureExceptionFunc(fmt.Errorf("{%s} => %w", l.LogContextName, err))
	}
	l.Log(ERR, format, v...)
	if l.WebhookConfig.SendError {
		l.sendWebhook(ERR, format, v...)
	}
}

// LogFatal sends a fatal error log message, triggers webhook if configured, and exits the program
func (l *Logger) LogFatal(format string, v ...any) {
	err := fmt.Errorf(format, v...)
	if l.CaptureExceptionFunc != nil {
		l.CaptureExceptionFunc(fmt.Errorf("{%s} => %w", l.LogContextName, err))
	}
	l.Log(ERR, format, v...)
	if l.WebhookConfig.SendFatal {
		l.sendWebhook(ERR, format, v...)
	}
	os.Exit(1)
}

// LogWarn sends a warning log message and optionally triggers webhook
func (l *Logger) LogWarn(format string, v ...any) {
	l.Log(WARN, format, v...)
	if l.WebhookConfig.SendWarn {
		l.sendWebhook(WARN, format, v...)
	}
}

// LogDebug sends a debug log message if debug logging is enabled
func (l *Logger) LogDebug(format string, v ...any) {
	l.Log(DEBUG, format, v...)
}

// sendWebhook sends a log message to the configured webhook endpoint
func (l *Logger) sendWebhook(logLevel LogLevel, format string, v ...any) {
	if l.WebhookConfig.URL == "" {
		return
	}

	message := fmt.Sprintf(format, v...)
	timestamp := time.Now().Format(time.RFC3339)

	payload := struct {
		ServiceName    string   `json:"serviceName"`
		LogContextName string   `json:"logContextName"`
		Message        string   `json:"message"`
		Level          LogLevel `json:"level"`
		Timestamp      string   `json:"timestamp"`
	}{
		ServiceName:    l.ServiceName,
		LogContextName: l.LogContextName,
		Message:        message,
		Level:          logLevel,
		Timestamp:      timestamp,
	}

	jsonPayload, err := json.Marshal(payload)
	if err != nil {
		l.Log(ERR, "Failed to marshal webhook payload: %v", err)
		return
	}

	resp, err := http.Post(l.WebhookConfig.URL, "application/json", bytes.NewBuffer(jsonPayload))
	if err != nil {
		l.Log(ERR, "Failed to send webhook: %v", err)
		return
	}
	defer func(body io.ReadCloser) {
		_ = body.Close()
	}(resp.Body)

	if resp.StatusCode != http.StatusOK {
		l.Log(ERR, "Webhook responded with status: %s", resp.Status)
	}
}
