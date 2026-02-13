package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func setupTestCredStore(t *testing.T) *CredentialStore {
	t.Helper()
	dir := t.TempDir()
	path := filepath.Join(dir, "creds.json")
	cs, err := NewCredentialStore(path)
	if err != nil {
		t.Fatalf("NewCredentialStore: %v", err)
	}
	return cs
}

func TestCredentialStoreCreateAndGet(t *testing.T) {
	cs := setupTestCredStore(t)

	cred, err := cs.CreateCredential("test key")
	if err != nil {
		t.Fatalf("CreateCredential: %v", err)
	}

	if cred.AccessKeyID == "" || cred.SecretAccessKey == "" {
		t.Fatal("expected non-empty keys")
	}

	got, ok := cs.GetCredential(cred.AccessKeyID)
	if !ok {
		t.Fatal("expected to find credential")
	}
	if got.SecretAccessKey != cred.SecretAccessKey {
		t.Fatal("secret key mismatch")
	}
}

func TestCredentialStoreEnsureDefault(t *testing.T) {
	cs := setupTestCredStore(t)

	cred, err := cs.EnsureDefault("TESTACCESS", "TESTSECRET")
	if err != nil {
		t.Fatalf("EnsureDefault: %v", err)
	}
	if cred.AccessKeyID != "TESTACCESS" {
		t.Fatalf("expected access key 'TESTACCESS', got %q", cred.AccessKeyID)
	}

	// Second call should return existing
	cred2, err := cs.EnsureDefault("OTHER", "OTHER")
	if err != nil {
		t.Fatalf("EnsureDefault second call: %v", err)
	}
	if cred2.AccessKeyID != "TESTACCESS" {
		t.Fatalf("expected existing credential, got %q", cred2.AccessKeyID)
	}
}

func TestCredentialStorePersistence(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "creds.json")

	cs1, _ := NewCredentialStore(path)
	cs1.EnsureDefault("PERSIST_KEY", "PERSIST_SECRET")

	cs2, err := NewCredentialStore(path)
	if err != nil {
		t.Fatalf("NewCredentialStore reload: %v", err)
	}
	cred, ok := cs2.GetCredential("PERSIST_KEY")
	if !ok {
		t.Fatal("expected persisted credential")
	}
	if cred.SecretAccessKey != "PERSIST_SECRET" {
		t.Fatal("secret key not persisted correctly")
	}
}

func TestSigV4Verification(t *testing.T) {
	cs := setupTestCredStore(t)
	cs.EnsureDefault("AKID1234567890123456", "SKSECRET1234567890123456789012345678")

	verifier := NewSigV4Verifier(cs, "us-east-1")

	// Build a signed request manually
	now := time.Now().UTC()
	dateStr := now.Format(DateFormat)
	amzDate := now.Format(TimeFormat)

	req := httptest.NewRequest(http.MethodGet, "http://localhost:9000/test-bucket", nil)
	req.Header.Set("Host", "localhost:9000")
	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", UnsignedPayload)

	signedHeaders := []string{"host", "x-amz-content-sha256", "x-amz-date"}
	canonicalRequest := buildCanonicalRequest(req, signedHeaders)

	credScope := fmt.Sprintf("%s/us-east-1/s3/aws4_request", dateStr)
	stringToSign := buildStringToSign(now, credScope, canonicalRequest)

	signingKey := deriveSigningKey("SKSECRET1234567890123456789012345678", dateStr, "us-east-1", "s3")
	signature := hex.EncodeToString(hmacSHA256(signingKey, []byte(stringToSign)))

	authHeader := fmt.Sprintf(
		"AWS4-HMAC-SHA256 Credential=AKID1234567890123456/%s/us-east-1/s3/aws4_request, SignedHeaders=%s, Signature=%s",
		dateStr,
		strings.Join(signedHeaders, ";"),
		signature,
	)
	req.Header.Set("Authorization", authHeader)

	keyID, err := verifier.VerifyRequest(req)
	if err != nil {
		t.Fatalf("VerifyRequest: %v", err)
	}
	if keyID != "AKID1234567890123456" {
		t.Fatalf("expected key ID 'AKID1234567890123456', got %q", keyID)
	}
}

func TestSigV4BadSignature(t *testing.T) {
	cs := setupTestCredStore(t)
	cs.EnsureDefault("AKID1234567890123456", "SKSECRET1234567890123456789012345678")

	verifier := NewSigV4Verifier(cs, "us-east-1")

	now := time.Now().UTC()
	dateStr := now.Format(DateFormat)
	amzDate := now.Format(TimeFormat)

	req := httptest.NewRequest(http.MethodGet, "http://localhost:9000/test-bucket", nil)
	req.Header.Set("Host", "localhost:9000")
	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", UnsignedPayload)

	authHeader := fmt.Sprintf(
		"AWS4-HMAC-SHA256 Credential=AKID1234567890123456/%s/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=badsignature",
		dateStr,
	)
	req.Header.Set("Authorization", authHeader)

	_, err := verifier.VerifyRequest(req)
	if err == nil {
		t.Fatal("expected error for bad signature")
	}
}

func TestSigV4UnknownKey(t *testing.T) {
	cs := setupTestCredStore(t)
	verifier := NewSigV4Verifier(cs, "us-east-1")

	now := time.Now().UTC()
	dateStr := now.Format(DateFormat)

	req := httptest.NewRequest(http.MethodGet, "http://localhost:9000/", nil)
	req.Header.Set("Host", "localhost:9000")
	req.Header.Set("X-Amz-Date", now.Format(TimeFormat))
	req.Header.Set("X-Amz-Content-Sha256", UnsignedPayload)

	authHeader := fmt.Sprintf(
		"AWS4-HMAC-SHA256 Credential=UNKNOWN/%s/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=abc123",
		dateStr,
	)
	req.Header.Set("Authorization", authHeader)

	_, err := verifier.VerifyRequest(req)
	if err == nil {
		t.Fatal("expected error for unknown key")
	}
}

func TestParseAuthorizationHeader(t *testing.T) {
	header := "AWS4-HMAC-SHA256 Credential=AKID/20250101/us-east-1/s3/aws4_request, SignedHeaders=host;x-amz-date, Signature=abc123"

	parsed, err := parseAuthorizationHeader(header)
	if err != nil {
		t.Fatalf("parseAuthorizationHeader: %v", err)
	}

	if parsed.AccessKeyID != "AKID" {
		t.Fatalf("expected AKID, got %q", parsed.AccessKeyID)
	}
	if parsed.Date != "20250101" {
		t.Fatalf("expected 20250101, got %q", parsed.Date)
	}
	if parsed.Region != "us-east-1" {
		t.Fatalf("expected us-east-1, got %q", parsed.Region)
	}
	if parsed.Signature != "abc123" {
		t.Fatalf("expected abc123, got %q", parsed.Signature)
	}
	if len(parsed.SignedHeaders) != 2 {
		t.Fatalf("expected 2 signed headers, got %d", len(parsed.SignedHeaders))
	}
}

func TestDeriveSigningKey(t *testing.T) {
	// Known test vector from AWS docs
	key := deriveSigningKey("wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "20150830", "us-east-1", "iam")
	expected := "c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9"

	h := hmac.New(sha256.New, nil)
	_ = h // just to verify we can compute
	_ = os.Remove

	got := hex.EncodeToString(key)
	if got != expected {
		t.Fatalf("signing key mismatch:\n  expected: %s\n  got:      %s", expected, got)
	}
}

func TestCanonicalizeQueryString(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"", ""},
		{"foo=bar", "foo=bar"},
		{"b=2&a=1", "a=1&b=2"},
		{"key=val%20ue", "key=val%20ue"},
	}

	for _, tt := range tests {
		req := httptest.NewRequest(http.MethodGet, "http://example.com/?"+tt.input, nil)
		got := canonicalizeQueryString(req.URL.Query())
		if got != tt.expected {
			t.Errorf("canonicalizeQueryString(%q) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}
