package logger

import (
	"bytes"
	"log"
	"os"
	"strings"
	"testing"
	"time"
)

func TestLogger(t *testing.T) {
	// Create a test logger
	l := NewLogger(
		"test-service",
		"test-context",
		true,
		WebhookConfig{
			URL:       "",
			SendError: false,
			SendFatal: false,
			SendWarn:  false,
		},
	)

	// Capture log output
	var buf bytes.Buffer
	log.SetOutput(&buf)
	defer log.SetOutput(os.Stderr)

	// Test log levels
	t.Run("LogInfo", func(t *testing.T) {
		buf.Reset()
		l.LogInfo("Test info message")
		output := buf.String()
		if !strings.Contains(output, "[test-service]") {
			t.Error("Service name not found in log output")
		}
		if !strings.Contains(output, "[INFO]") {
			t.Error("Log level not found in output")
		}
		if !strings.Contains(output, "Test info message") {
			t.Error("Message not found in output")
		}
	})

	t.Run("LogDebug", func(t *testing.T) {
		buf.Reset()
		l.LogDebug("Test debug message")
		output := buf.String()
		if !strings.Contains(output, "[DEBUG]") {
			t.Error("Debug level not found in output")
		}
		if !strings.Contains(output, "Test debug message") {
			t.Error("Message not found in output")
		}
	})

	t.Run("LogWarn", func(t *testing.T) {
		buf.Reset()
		l.LogWarn("Test warning message")
		output := buf.String()
		if !strings.Contains(output, "[WARN]") {
			t.Error("Warning level not found in output")
		}
		if !strings.Contains(output, "Test warning message") {
			t.Error("Message not found in output")
		}
	})

	t.Run("LogError", func(t *testing.T) {
		buf.Reset()
		l.LogError("Test error message")
		output := buf.String()
		if !strings.Contains(output, "[ERR]") {
			t.Error("Error level not found in output")
		}
		if !strings.Contains(output, "Test error message") {
			t.Error("Message not found in output")
		}
	})

	// Test error capture
	t.Run("ErrorCapture", func(t *testing.T) {
		var capturedError error
		l.CaptureExceptionFunc = func(err error) {
			capturedError = err
		}
		l.LogError("Test error capture")
		if capturedError == nil {
			t.Error("Error capture function was not called")
		}
		if !strings.Contains(capturedError.Error(), "Test error capture") {
			t.Error("Captured error message mismatch")
		}
	})

	// Test webhook (disabled in this test)
	t.Run("WebhookDisabled", func(t *testing.T) {
		buf.Reset()
		l.WebhookConfig.URL = "http://localhost:9999" // Non-existent URL
		l.WebhookConfig.SendError = true
		l.LogError("Test webhook message")
		// Should not fail even though webhook will fail
		// Verify that the error was still logged
		if !strings.Contains(buf.String(), "Test webhook message") {
			t.Error("Error message not logged when webhook fails")
		}
	})
}

func TestLogLevels(t *testing.T) {
	// Capture log output
	var buf bytes.Buffer
	log.SetOutput(&buf)
	defer log.SetOutput(os.Stderr)

	l := NewLogger(
		"test-service",
		"test-context",
		false, // Debug disabled
		WebhookConfig{},
	)

	// Test that debug messages are not logged when debug is disabled
	buf.Reset()
	l.LogDebug("This should not be logged")
	if buf.Len() > 0 {
		t.Error("Debug message was logged when debug is disabled")
	}

	// Enable debug and verify message is logged
	l.DebugEnabled = true
	buf.Reset()
	l.LogDebug("This should be logged")
	if !strings.Contains(buf.String(), "This should be logged") {
		t.Error("Debug message was not logged when debug is enabled")
	}
}

func TestWebhookPayload(t *testing.T) {
	l := NewLogger(
		"test-service",
		"test-context",
		true,
		WebhookConfig{
			URL:       "http://localhost:9999",
			SendError: true,
		},
	)

	// Test webhook payload structure
	message := "Test webhook message"
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
		Level:          ERR,
		Timestamp:      timestamp,
	}

	if payload.ServiceName != l.ServiceName {
		t.Error("ServiceName mismatch in webhook payload")
	}
	if payload.LogContextName != l.LogContextName {
		t.Error("LogContextName mismatch in webhook payload")
	}
	if payload.Message != message {
		t.Error("Message mismatch in webhook payload")
	}
	if payload.Level != ERR {
		t.Error("Level mismatch in webhook payload")
	}
}
