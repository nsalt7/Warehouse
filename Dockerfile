# ── Build Stage ───────────────────────────────────────────────────────────────
FROM golang:1.23-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /src

# Cache dependencies
COPY go.mod go.sum ./
RUN go mod download

# Build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags "-s -w" \
    -o /bin/warehouse \
    ./cmd/warehouse

# ── Runtime Stage ─────────────────────────────────────────────────────────────
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -S warehouse && \
    adduser -S -G warehouse warehouse

COPY --from=builder /bin/warehouse /usr/local/bin/warehouse

RUN mkdir -p /data && chown warehouse:warehouse /data

USER warehouse

EXPOSE 9000

VOLUME ["/data"]

ENV WAREHOUSE_DATA_DIR=/data \
    WAREHOUSE_LISTEN_ADDR=:9000 \
    WAREHOUSE_LOG_LEVEL=info \
    WAREHOUSE_AUTH_MODE=both \
    WAREHOUSE_REGION=us-east-1

ENTRYPOINT ["warehouse"]
