# Logger

A flexible and configurable logging solution for Go applications with support for different log levels, colored output, and webhook notifications.

## Features

- Multiple log levels (INFO, ERROR, WARN, DEBUG)
- Colored console output
- Webhook notifications for important events
- Custom error handling through callback functions
- Service and context identification
- Configurable debug mode

## Installation

```bash
go get github.com/gomessguii/logger
```

## Usage

### Basic Usage

```go
package main

import (
    "github.com/gomessguii/logger"
)

func main() {
    // Create a new logger instance
    l := logger.NewLogger(
        "my-service",
        "main",
        true, // enable debug logs
        logger.WebhookConfig{
            URL:       "https://webhook.example.com",
            SendError: true,
            SendFatal: true,
            SendWarn:  true,
        },
    )

    // Log messages
    l.LogInfo("Service started")
    l.LogDebug("Debug information: %s", "some debug data")
    l.LogWarn("Warning: %s", "something might be wrong")
    l.LogError("Error occurred: %s", "error details")
}
```

### Advanced Usage

```go
// Create logger with custom error handler
l := logger.NewLogger(
    "my-service",
    "main",
    true,
    logger.WebhookConfig{
        URL: "https://webhook.example.com",
    },
)

// Set custom error handler
l.CaptureExceptionFunc = func(err error) {
    // Handle the error (e.g., send to error tracking service)
    fmt.Printf("Captured error: %v\n", err)
}

// Log with context
l.LogInfo("Processing request %s", "request-id")
```

## Configuration

### Logger Options

- `ServiceName`: Identifies the service generating the logs
- `LogContextName`: Provides additional context for the logs
- `DebugEnabled`: Controls whether debug messages are logged
- `CaptureExceptionFunc`: Optional callback for error handling
- `WebhookConfig`: Settings for webhook notifications

### Webhook Configuration

- `URL`: Endpoint where log messages will be sent
- `SendError`: Enable webhook notifications for errors
- `SendFatal`: Enable webhook notifications for fatal errors
- `SendWarn`: Enable webhook notifications for warnings

## Log Levels

- `INFO`: Informational messages
- `ERROR`: Error messages
- `WARN`: Warning messages
- `DEBUG`: Debug messages (only logged when DebugEnabled is true)

## Webhook Payload

The webhook payload has the following structure:

```json
{
    "serviceName": "my-service",
    "logContextName": "main",
    "message": "Error occurred",
    "level": "ERROR",
    "timestamp": "2024-03-14T12:00:00Z"
}
```

## License

MIT License - see [LICENSE](LICENSE) for details.