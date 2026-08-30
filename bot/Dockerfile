# Stage 1: Build
FROM golang:1.21-alpine AS builder
RUN apk add --no-cache git
WORKDIR /app
COPY bot/go.mod bot/go.sum ./
RUN go mod download
COPY bot/ .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bot-ocp .

# Stage 2: Runtime
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/bot-ocp .
COPY bot/migrations/ ./migrations/
RUN mkdir -p uploads data
EXPOSE 8090
CMD ["./bot-ocp"]
