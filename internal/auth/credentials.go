// Package auth provides authentication and authorization for the Warehouse S3 server,
// including AWS Signature V4 and a simple access-key/secret-key fallback.
package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"
)

// Credential represents an access key pair.
type Credential struct {
	AccessKeyID     string    `json:"access_key_id"`
	SecretAccessKey  string    `json:"secret_access_key"`
	Description     string    `json:"description,omitempty"`
	CreatedAt       time.Time `json:"created_at"`
	Active          bool      `json:"active"`
}

// CredentialStore manages access key credentials.
type CredentialStore struct {
	mu          sync.RWMutex
	credentials map[string]*Credential // keyed by AccessKeyID
	filePath    string
}

// NewCredentialStore creates or loads a credential store from disk.
func NewCredentialStore(filePath string) (*CredentialStore, error) {
	cs := &CredentialStore{
		credentials: make(map[string]*Credential),
		filePath:    filePath,
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return cs, nil
		}
		return nil, fmt.Errorf("reading credentials file: %w", err)
	}

	var creds []*Credential
	if err := json.Unmarshal(data, &creds); err != nil {
		return nil, fmt.Errorf("parsing credentials file: %w", err)
	}

	for _, c := range creds {
		cs.credentials[c.AccessKeyID] = c
	}

	return cs, nil
}

// GetCredential retrieves a credential by access key ID.
func (cs *CredentialStore) GetCredential(accessKeyID string) (*Credential, bool) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	cred, ok := cs.credentials[accessKeyID]
	if !ok || !cred.Active {
		return nil, false
	}
	return cred, true
}

// CreateCredential generates a new access key pair.
func (cs *CredentialStore) CreateCredential(description string) (*Credential, error) {
	accessKey, err := generateRandomKey(20)
	if err != nil {
		return nil, fmt.Errorf("generating access key: %w", err)
	}

	secretKey, err := generateRandomKey(40)
	if err != nil {
		return nil, fmt.Errorf("generating secret key: %w", err)
	}

	cred := &Credential{
		AccessKeyID:    accessKey,
		SecretAccessKey: secretKey,
		Description:    description,
		CreatedAt:      time.Now().UTC(),
		Active:         true,
	}

	cs.mu.Lock()
	defer cs.mu.Unlock()

	cs.credentials[cred.AccessKeyID] = cred
	if err := cs.persist(); err != nil {
		delete(cs.credentials, cred.AccessKeyID)
		return nil, fmt.Errorf("persisting credentials: %w", err)
	}

	return cred, nil
}

// EnsureDefault creates a default credential if none exist, or uses provided keys.
func (cs *CredentialStore) EnsureDefault(accessKey, secretKey string) (*Credential, error) {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	if len(cs.credentials) > 0 {
		// Return first active credential
		for _, c := range cs.credentials {
			if c.Active {
				return c, nil
			}
		}
	}

	// Create default credential
	cred := &Credential{
		AccessKeyID:    accessKey,
		SecretAccessKey: secretKey,
		Description:    "default",
		CreatedAt:      time.Now().UTC(),
		Active:         true,
	}

	if cred.AccessKeyID == "" {
		key, err := generateRandomKey(20)
		if err != nil {
			return nil, err
		}
		cred.AccessKeyID = key
	}
	if cred.SecretAccessKey == "" {
		key, err := generateRandomKey(40)
		if err != nil {
			return nil, err
		}
		cred.SecretAccessKey = key
	}

	cs.credentials[cred.AccessKeyID] = cred
	if err := cs.persist(); err != nil {
		return nil, err
	}

	return cred, nil
}

// persist writes all credentials to disk.
func (cs *CredentialStore) persist() error {
	creds := make([]*Credential, 0, len(cs.credentials))
	for _, c := range cs.credentials {
		creds = append(creds, c)
	}

	data, err := json.MarshalIndent(creds, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(cs.filePath, data, 0o600)
}

// generateRandomKey generates a hex-encoded random key of the specified byte length.
func generateRandomKey(byteLen int) (string, error) {
	buf := make([]byte, byteLen)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf)[:byteLen], nil
}
