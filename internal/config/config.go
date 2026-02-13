// Package config provides configuration management for the Warehouse S3-compatible server.
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config holds all server configuration.
type Config struct {
	// Server settings
	ListenAddr string `json:"listen_addr"`
	DataDir    string `json:"data_dir"`

	// TLS settings (optional)
	TLSCertFile string `json:"tls_cert_file,omitempty"`
	TLSKeyFile  string `json:"tls_key_file,omitempty"`

	// Authentication
	AuthMode string `json:"auth_mode"` // "sigv4", "simple", or "both"
	Region   string `json:"region"`

	// Default credentials (created on first run if no credentials exist)
	DefaultAccessKey string `json:"default_access_key,omitempty"`
	DefaultSecretKey string `json:"default_secret_key,omitempty"`

	// Limits
	MaxObjectSize     int64         `json:"max_object_size"`      // bytes
	MaxPartSize       int64         `json:"max_part_size"`        // bytes
	MaxPartsPerUpload int           `json:"max_parts_per_upload"`
	RequestTimeout    time.Duration `json:"request_timeout"`

	// Lifecycle
	LifecycleCheckInterval time.Duration `json:"lifecycle_check_interval"`

	// Logging
	LogLevel string `json:"log_level"` // "debug", "info", "warn", "error"
}

// DefaultConfig returns a Config with sensible defaults.
func DefaultConfig() *Config {
	return &Config{
		ListenAddr:             ":9000",
		DataDir:                "./data",
		AuthMode:               "both",
		Region:                 "us-east-1",
		MaxObjectSize:          5 * 1024 * 1024 * 1024, // 5 GiB
		MaxPartSize:            5 * 1024 * 1024 * 1024,  // 5 GiB
		MaxPartsPerUpload:      10000,
		RequestTimeout:         5 * time.Minute,
		LifecycleCheckInterval: 24 * time.Hour,
		LogLevel:               "info",
	}
}

// LoadFromFile reads configuration from a JSON file and merges with defaults.
func LoadFromFile(path string) (*Config, error) {
	cfg := DefaultConfig()

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return nil, fmt.Errorf("reading config file: %w", err)
	}

	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parsing config file: %w", err)
	}

	return cfg, nil
}

// ApplyEnvironment overrides configuration with environment variables.
func (c *Config) ApplyEnvironment() {
	if v := os.Getenv("WAREHOUSE_LISTEN_ADDR"); v != "" {
		c.ListenAddr = v
	}
	if v := os.Getenv("WAREHOUSE_DATA_DIR"); v != "" {
		c.DataDir = v
	}
	if v := os.Getenv("WAREHOUSE_AUTH_MODE"); v != "" {
		c.AuthMode = v
	}
	if v := os.Getenv("WAREHOUSE_REGION"); v != "" {
		c.Region = v
	}
	if v := os.Getenv("WAREHOUSE_TLS_CERT"); v != "" {
		c.TLSCertFile = v
	}
	if v := os.Getenv("WAREHOUSE_TLS_KEY"); v != "" {
		c.TLSKeyFile = v
	}
	if v := os.Getenv("WAREHOUSE_DEFAULT_ACCESS_KEY"); v != "" {
		c.DefaultAccessKey = v
	}
	if v := os.Getenv("WAREHOUSE_DEFAULT_SECRET_KEY"); v != "" {
		c.DefaultSecretKey = v
	}
	if v := os.Getenv("WAREHOUSE_MAX_OBJECT_SIZE"); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			c.MaxObjectSize = n
		}
	}
	if v := os.Getenv("WAREHOUSE_LOG_LEVEL"); v != "" {
		c.LogLevel = v
	}
}

// Validate checks that the configuration is valid.
func (c *Config) Validate() error {
	if c.ListenAddr == "" {
		return fmt.Errorf("listen_addr is required")
	}
	if c.DataDir == "" {
		return fmt.Errorf("data_dir is required")
	}
	switch c.AuthMode {
	case "sigv4", "simple", "both":
		// valid
	default:
		return fmt.Errorf("auth_mode must be 'sigv4', 'simple', or 'both', got %q", c.AuthMode)
	}
	if c.MaxObjectSize <= 0 {
		return fmt.Errorf("max_object_size must be positive")
	}
	return nil
}
