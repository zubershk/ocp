package logger

import "os"

var defaultLogger = NewLogger("evolution-go", "default", true, WebhookConfig{})

func init() {
	// Ensure log directory exists
	os.MkdirAll("/tmp", 0755)
}

// Package-level convenience functions
func LogInfo(format string, v ...any) {
	defaultLogger.LogInfo(format, v...)
}

func LogError(format string, v ...any) {
	defaultLogger.LogError(format, v...)
}

func LogWarn(format string, v ...any) {
	defaultLogger.LogWarn(format, v...)
}

func LogDebug(format string, v ...any) {
	defaultLogger.LogDebug(format, v...)
}

func LogFatal(format string, v ...any) {
	defaultLogger.LogFatal(format, v...)
}
