.PHONY: build run test test-verbose clean lint fmt vet docker-build docker-run

BINARY_NAME := warehouse
BUILD_DIR := ./bin
MAIN_PATH := ./cmd/warehouse
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
BUILD_TIME := $(shell date -u '+%Y-%m-%dT%H:%M:%SZ')
LDFLAGS := -ldflags "-X main.version=$(VERSION) -X main.buildTime=$(BUILD_TIME)"

# ── Build ────────────────────────────────────────────────────────────────────

build:
	@echo "Building $(BINARY_NAME)..."
	@mkdir -p $(BUILD_DIR)
	go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME) $(MAIN_PATH)
	@echo "Built: $(BUILD_DIR)/$(BINARY_NAME)"

build-linux:
	@echo "Cross-compiling for Linux amd64..."
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o $(BUILD_DIR)/$(BINARY_NAME)-linux-amd64 $(MAIN_PATH)

build-all: build build-linux

# ── Run ──────────────────────────────────────────────────────────────────────

run: build
	$(BUILD_DIR)/$(BINARY_NAME)

# ── Test ─────────────────────────────────────────────────────────────────────

test:
	go test ./... -count=1

test-verbose:
	go test ./... -v -count=1

test-race:
	go test ./... -race -count=1

test-cover:
	go test ./... -coverprofile=coverage.out -count=1
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

bench:
	go test ./... -bench=. -benchmem

# ── Code Quality ─────────────────────────────────────────────────────────────

fmt:
	gofmt -s -w .

vet:
	go vet ./...

lint: vet
	@echo "Running go vet passed"
	@command -v staticcheck >/dev/null 2>&1 && staticcheck ./... || echo "staticcheck not installed, skipping"

# ── Clean ────────────────────────────────────────────────────────────────────

clean:
	rm -rf $(BUILD_DIR)
	rm -f coverage.out coverage.html

# ── Docker ───────────────────────────────────────────────────────────────────

docker-build:
	docker build -t warehouse:latest .

docker-run:
	docker run -p 9000:9000 -v warehouse-data:/data warehouse:latest

# ── Development ──────────────────────────────────────────────────────────────

tidy:
	go mod tidy

deps: tidy
	go mod download
