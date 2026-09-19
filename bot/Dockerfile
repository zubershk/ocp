# Stage 1: Build
FROM golang:1.25.0-alpine3.21@sha256:c8e1680f8002c64ddfba276a3c1f763097cb182402673143a89dcca4c107cf17 AS builder
RUN apk add --no-cache git
WORKDIR /app
COPY bot/go.mod bot/go.sum ./
RUN go mod download
COPY bot/ .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o bot-ocp .

# Stage 2: Runtime
FROM alpine:3.20.3@sha256:1e42bbe2508154c9126d48c2b8a75420c3544343bf86fd041fb7527e017a4b4a
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
ENV GIN_MODE=release
COPY --from=builder /app/bot-ocp .
COPY bot/migrations/ ./migrations/
RUN mkdir -p uploads data && chown -R nobody:nobody /app
EXPOSE 8090
USER nobody
CMD ["./bot-ocp"]
