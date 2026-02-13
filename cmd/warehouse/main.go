// Command warehouse starts the Warehouse S3-compatible object storage server.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/warehouse/warehouse/internal/api"
	"github.com/warehouse/warehouse/internal/auth"
	"github.com/warehouse/warehouse/internal/config"
	"github.com/warehouse/warehouse/internal/lifecycle"
	"github.com/warehouse/warehouse/internal/storage"
)

func main() {
	configPath := flag.String("config", "", "Path to configuration file (JSON)")
	flag.Parse()

	// Load configuration
	cfg, err := config.LoadFromFile(*configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error loading config: %v\n", err)
		os.Exit(1)
	}
	cfg.ApplyEnvironment()

	if err := cfg.Validate(); err != nil {
		fmt.Fprintf(os.Stderr, "invalid configuration: %v\n", err)
		os.Exit(1)
	}

	// Set up structured logging
	var logLevel slog.Level
	switch cfg.LogLevel {
	case "debug":
		logLevel = slog.LevelDebug
	case "warn":
		logLevel = slog.LevelWarn
	case "error":
		logLevel = slog.LevelError
	default:
		logLevel = slog.LevelInfo
	}

	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: logLevel,
	}))
	slog.SetDefault(logger)

	// Initialize storage backend
	store, err := storage.NewFilesystem(cfg.DataDir)
	if err != nil {
		logger.Error("failed to initialize storage", "error", err)
		os.Exit(1)
	}
	logger.Info("storage initialized", "data_dir", cfg.DataDir)

	// Initialize credential store
	credPath := filepath.Join(cfg.DataDir, "credentials.json")
	credStore, err := auth.NewCredentialStore(credPath)
	if err != nil {
		logger.Error("failed to initialize credential store", "error", err)
		os.Exit(1)
	}

	// Ensure default credentials exist
	defaultCred, err := credStore.EnsureDefault(cfg.DefaultAccessKey, cfg.DefaultSecretKey)
	if err != nil {
		logger.Error("failed to create default credentials", "error", err)
		os.Exit(1)
	}
	logger.Info("credentials ready",
		"access_key", defaultCred.AccessKeyID,
		"secret_key", defaultCred.SecretAccessKey,
	)

	// Initialize auth components
	sigv4Verifier := auth.NewSigV4Verifier(credStore, cfg.Region)
	presignedVerifier := auth.NewPresignedVerifier(credStore, cfg.Region)

	// Build HTTP handler
	handler := api.NewRouter(api.RouterConfig{
		Store:     store,
		CredStore: credStore,
		SigV4:     sigv4Verifier,
		Presigned: presignedVerifier,
		Logger:    logger,
		Region:    cfg.Region,
		AuthMode:  cfg.AuthMode,
	})

	// Create HTTP server
	server := &http.Server{
		Addr:         cfg.ListenAddr,
		Handler:      handler,
		ReadTimeout:  cfg.RequestTimeout,
		WriteTimeout: cfg.RequestTimeout,
		IdleTimeout:  120 * time.Second,
	}

	// Start lifecycle processor
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		lp := lifecycle.NewProcessor(store, cfg.LifecycleCheckInterval, logger)
		lp.Start(ctx)
	}()

	// Handle graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-sigCh
		logger.Info("received shutdown signal", "signal", sig.String())
		cancel()

		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer shutdownCancel()

		if err := server.Shutdown(shutdownCtx); err != nil {
			logger.Error("server shutdown error", "error", err)
		}
	}()

	// Start server
	logger.Info("warehouse S3 server starting",
		"addr", cfg.ListenAddr,
		"region", cfg.Region,
		"auth_mode", cfg.AuthMode,
	)

	if cfg.TLSCertFile != "" && cfg.TLSKeyFile != "" {
		logger.Info("TLS enabled", "cert", cfg.TLSCertFile, "key", cfg.TLSKeyFile)
		if err := server.ListenAndServeTLS(cfg.TLSCertFile, cfg.TLSKeyFile); err != http.ErrServerClosed {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	} else {
		if err := server.ListenAndServe(); err != http.ErrServerClosed {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}

	logger.Info("warehouse server stopped")
}
