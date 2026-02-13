package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

const (
	// SignatureV4Algorithm is the algorithm identifier used in the Authorization header.
	SignatureV4Algorithm = "AWS4-HMAC-SHA256"

	// TimeFormat is the ISO 8601 format used in SigV4.
	TimeFormat = "20060102T150405Z"

	// DateFormat is the short date format used in credential scope.
	DateFormat = "20060102"

	// ServiceName is the AWS service name used in signing.
	ServiceName = "s3"

	// TerminationString is the termination string in credential scope.
	TerminationString = "aws4_request"

	// MaxClockSkew is the maximum allowed clock difference.
	MaxClockSkew = 15 * time.Minute

	// UnsignedPayload indicates the payload is not signed.
	UnsignedPayload = "UNSIGNED-PAYLOAD"
)

// SigV4Verifier verifies AWS Signature Version 4 requests.
type SigV4Verifier struct {
	credStore *CredentialStore
	region    string
}

// NewSigV4Verifier creates a new SigV4 verifier.
func NewSigV4Verifier(credStore *CredentialStore, region string) *SigV4Verifier {
	return &SigV4Verifier{
		credStore: credStore,
		region:    region,
	}
}

// ParsedAuth holds the parsed components of a SigV4 Authorization header.
type ParsedAuth struct {
	AccessKeyID   string
	Date          string
	Region        string
	Service       string
	SignedHeaders []string
	Signature     string
}

// VerifyRequest verifies a SigV4-signed request. Returns the access key ID on success.
func (v *SigV4Verifier) VerifyRequest(r *http.Request) (string, error) {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return "", fmt.Errorf("missing Authorization header")
	}

	parsed, err := parseAuthorizationHeader(authHeader)
	if err != nil {
		return "", err
	}

	// Validate region and service
	if parsed.Region != v.region {
		return "", fmt.Errorf("invalid region %q, expected %q", parsed.Region, v.region)
	}
	if parsed.Service != ServiceName {
		return "", fmt.Errorf("invalid service %q, expected %q", parsed.Service, ServiceName)
	}

	// Look up credentials
	cred, ok := v.credStore.GetCredential(parsed.AccessKeyID)
	if !ok {
		return "", fmt.Errorf("unknown access key: %s", parsed.AccessKeyID)
	}

	// Determine request time
	requestTime, err := getRequestTime(r)
	if err != nil {
		return "", fmt.Errorf("invalid request time: %w", err)
	}

	// Check clock skew
	if abs(time.Since(requestTime)) > MaxClockSkew {
		return "", fmt.Errorf("request time too skewed")
	}

	// Build canonical request
	canonicalRequest := buildCanonicalRequest(r, parsed.SignedHeaders)

	// Build string to sign
	credentialScope := fmt.Sprintf("%s/%s/%s/%s",
		parsed.Date, parsed.Region, parsed.Service, TerminationString)
	stringToSign := buildStringToSign(requestTime, credentialScope, canonicalRequest)

	// Calculate expected signature
	signingKey := deriveSigningKey(cred.SecretAccessKey, parsed.Date, parsed.Region, parsed.Service)
	expectedSig := hex.EncodeToString(hmacSHA256(signingKey, []byte(stringToSign)))

	if !hmac.Equal([]byte(expectedSig), []byte(parsed.Signature)) {
		return "", fmt.Errorf("signature mismatch")
	}

	return parsed.AccessKeyID, nil
}

// parseAuthorizationHeader parses a SigV4 Authorization header value.
// Format: AWS4-HMAC-SHA256 Credential=<key>/<date>/<region>/<service>/aws4_request,
//
//	SignedHeaders=<headers>, Signature=<sig>
func parseAuthorizationHeader(header string) (*ParsedAuth, error) {
	if !strings.HasPrefix(header, SignatureV4Algorithm+" ") {
		return nil, fmt.Errorf("unsupported algorithm")
	}

	rest := strings.TrimPrefix(header, SignatureV4Algorithm+" ")
	parts := strings.Split(rest, ",")

	parsed := &ParsedAuth{}
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "Credential=") {
			cred := strings.TrimPrefix(part, "Credential=")
			credParts := strings.SplitN(cred, "/", 5)
			if len(credParts) != 5 {
				return nil, fmt.Errorf("malformed credential: %s", cred)
			}
			parsed.AccessKeyID = credParts[0]
			parsed.Date = credParts[1]
			parsed.Region = credParts[2]
			parsed.Service = credParts[3]
			if credParts[4] != TerminationString {
				return nil, fmt.Errorf("invalid termination string: %s", credParts[4])
			}
		} else if strings.HasPrefix(part, "SignedHeaders=") {
			headers := strings.TrimPrefix(part, "SignedHeaders=")
			parsed.SignedHeaders = strings.Split(headers, ";")
		} else if strings.HasPrefix(part, "Signature=") {
			parsed.Signature = strings.TrimPrefix(part, "Signature=")
		}
	}

	if parsed.AccessKeyID == "" || parsed.Signature == "" || len(parsed.SignedHeaders) == 0 {
		return nil, fmt.Errorf("incomplete authorization header")
	}

	return parsed, nil
}

// buildCanonicalRequest constructs the canonical request string per SigV4 spec.
func buildCanonicalRequest(r *http.Request, signedHeaders []string) string {
	// HTTP method
	method := r.Method

	// Canonical URI (path-encoded)
	canonicalURI := canonicalizePath(r.URL.Path)

	// Canonical query string
	canonicalQuery := canonicalizeQueryString(r.URL.Query())

	// Canonical headers
	var headerLines []string
	for _, h := range signedHeaders {
		h = strings.ToLower(h)
		values := r.Header.Values(h)
		if h == "host" && len(values) == 0 {
			values = []string{r.Host}
		}
		var trimmed []string
		for _, v := range values {
			trimmed = append(trimmed, strings.TrimSpace(v))
		}
		headerLines = append(headerLines, h+":"+strings.Join(trimmed, ","))
	}
	canonicalHeaders := strings.Join(headerLines, "\n") + "\n"

	// Signed headers
	signedHeadersStr := strings.Join(signedHeaders, ";")

	// Hashed payload
	hashedPayload := r.Header.Get("X-Amz-Content-Sha256")
	if hashedPayload == "" {
		hashedPayload = UnsignedPayload
	}

	return strings.Join([]string{
		method,
		canonicalURI,
		canonicalQuery,
		canonicalHeaders,
		signedHeadersStr,
		hashedPayload,
	}, "\n")
}

// buildStringToSign creates the string to sign per SigV4 spec.
func buildStringToSign(t time.Time, credentialScope, canonicalRequest string) string {
	return strings.Join([]string{
		SignatureV4Algorithm,
		t.UTC().Format(TimeFormat),
		credentialScope,
		hashSHA256([]byte(canonicalRequest)),
	}, "\n")
}

// deriveSigningKey derives the SigV4 signing key.
func deriveSigningKey(secretKey, date, region, service string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+secretKey), []byte(date))
	kRegion := hmacSHA256(kDate, []byte(region))
	kService := hmacSHA256(kRegion, []byte(service))
	kSigning := hmacSHA256(kService, []byte(TerminationString))
	return kSigning
}

// getRequestTime extracts the request timestamp from headers.
func getRequestTime(r *http.Request) (time.Time, error) {
	// Prefer X-Amz-Date
	if amzDate := r.Header.Get("X-Amz-Date"); amzDate != "" {
		return time.Parse(TimeFormat, amzDate)
	}

	// Fall back to Date header
	if dateStr := r.Header.Get("Date"); dateStr != "" {
		return time.Parse(time.RFC1123, dateStr)
	}

	return time.Time{}, fmt.Errorf("no date header found")
}

// canonicalizePath normalizes the URI path per SigV4 spec.
func canonicalizePath(path string) string {
	if path == "" {
		return "/"
	}

	// Split, encode each segment, rejoin
	segments := strings.Split(path, "/")
	var encoded []string
	for _, seg := range segments {
		encoded = append(encoded, uriEncode(seg, false))
	}
	return strings.Join(encoded, "/")
}

// canonicalizeQueryString sorts and encodes query parameters per SigV4 spec.
func canonicalizeQueryString(query url.Values) string {
	if len(query) == 0 {
		return ""
	}

	var pairs []string
	for key, values := range query {
		for _, value := range values {
			pairs = append(pairs, uriEncode(key, true)+"="+uriEncode(value, true))
		}
	}
	sort.Strings(pairs)
	return strings.Join(pairs, "&")
}

// uriEncode performs URI encoding per the SigV4 spec.
func uriEncode(s string, encodeSlash bool) string {
	var buf strings.Builder
	for _, b := range []byte(s) {
		if isUnreserved(b) || (b == '/' && !encodeSlash) {
			buf.WriteByte(b)
		} else {
			fmt.Fprintf(&buf, "%%%02X", b)
		}
	}
	return buf.String()
}

// isUnreserved returns true if the byte is an unreserved character per RFC 3986.
func isUnreserved(b byte) bool {
	return (b >= 'A' && b <= 'Z') || (b >= 'a' && b <= 'z') ||
		(b >= '0' && b <= '9') || b == '-' || b == '_' || b == '.' || b == '~'
}

// hmacSHA256 computes HMAC-SHA256.
func hmacSHA256(key, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return h.Sum(nil)
}

// hashSHA256 returns the hex-encoded SHA-256 hash.
func hashSHA256(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

// HashSHA256Reader computes SHA-256 of a reader's contents and returns the hex string.
func HashSHA256Reader(r io.Reader) (string, error) {
	h := sha256.New()
	if _, err := io.Copy(h, r); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func abs(d time.Duration) time.Duration {
	if d < 0 {
		return -d
	}
	return d
}
