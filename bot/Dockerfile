# Stage 1: Build
FROM golang:1.25.0-alpine3.20@sha256:5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5 AS builder
RUN apk add --no-cache git
WORKDIR /app
COPY bot/go.mod bot/go.sum ./
RUN go mod download
COPY bot/ .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bot-ocp .

# Stage 2: Runtime
FROM alpine:3.20.3@sha256:5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
ENV GIN_MODE=release
COPY --from=builder /app/bot-ocp .
COPY bot/migrations/ ./migrations/
RUN mkdir -p uploads data && chown -R nobody:nobody /app
EXPOSE 8090
USER nobody
CMD ["./bot-ocp"]
