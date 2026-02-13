package auth

import (
	"crypto/hmac"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// PresignedVerifier handles presigned URL verification and generation.
type PresignedVerifier struct {
	credStore *CredentialStore
	region    string
}

// NewPresignedVerifier creates a new presigned URL verifier.
func NewPresignedVerifier(credStore *CredentialStore, region string) *PresignedVerifier {
	return &PresignedVerifier{
		credStore: credStore,
		region:    region,
	}
}

// IsPresigned checks if a request is a presigned URL request.
func IsPresigned(r *http.Request) bool {
	q := r.URL.Query()
	return q.Get("X-Amz-Algorithm") != "" || q.Get("X-Amz-Credential") != ""
}

// VerifyPresigned verifies a presigned URL request. Returns the access key ID on success.
func (p *PresignedVerifier) VerifyPresigned(r *http.Request) (string, error) {
	q := r.URL.Query()

	algorithm := q.Get("X-Amz-Algorithm")
	if algorithm != SignatureV4Algorithm {
		return "", fmt.Errorf("unsupported algorithm: %s", algorithm)
	}

	// Parse credential
	credStr := q.Get("X-Amz-Credential")
	credParts := strings.SplitN(credStr, "/", 5)
	if len(credParts) != 5 {
		return "", fmt.Errorf("malformed credential: %s", credStr)
	}

	accessKeyID := credParts[0]
	date := credParts[1]
	region := credParts[2]
	service := credParts[3]

	if region != p.region {
		return "", fmt.Errorf("invalid region %q", region)
	}
	if service != ServiceName {
		return "", fmt.Errorf("invalid service %q", service)
	}
	if credParts[4] != TerminationString {
		return "", fmt.Errorf("invalid termination string")
	}

	// Look up credentials
	cred, ok := p.credStore.GetCredential(accessKeyID)
	if !ok {
		return "", fmt.Errorf("unknown access key: %s", accessKeyID)
	}

	// Parse and validate time
	amzDate := q.Get("X-Amz-Date")
	requestTime, err := time.Parse(TimeFormat, amzDate)
	if err != nil {
		return "", fmt.Errorf("invalid X-Amz-Date: %w", err)
	}

	// Check expiration
	expiresStr := q.Get("X-Amz-Expires")
	expires, err := strconv.Atoi(expiresStr)
	if err != nil || expires <= 0 || expires > 604800 { // max 7 days
		return "", fmt.Errorf("invalid X-Amz-Expires: %s", expiresStr)
	}

	if time.Now().UTC().After(requestTime.Add(time.Duration(expires) * time.Second)) {
		return "", fmt.Errorf("presigned URL has expired")
	}

	// Parse signed headers
	signedHeadersStr := q.Get("X-Amz-SignedHeaders")
	signedHeaders := strings.Split(signedHeadersStr, ";")

	providedSig := q.Get("X-Amz-Signature")

	// Build canonical request for presigned URL
	// Remove X-Amz-Signature from query for signing
	queryForSigning := make(url.Values)
	for key, values := range q {
		if key == "X-Amz-Signature" {
			continue
		}
		queryForSigning[key] = values
	}

	canonicalRequest := buildPresignedCanonicalRequest(r, queryForSigning, signedHeaders)

	// Build string to sign
	credentialScope := fmt.Sprintf("%s/%s/%s/%s", date, region, service, TerminationString)
	stringToSign := buildStringToSign(requestTime, credentialScope, canonicalRequest)

	// Calculate expected signature
	signingKey := deriveSigningKey(cred.SecretAccessKey, date, region, service)
	expectedSig := hex.EncodeToString(hmacSHA256(signingKey, []byte(stringToSign)))

	if !hmac.Equal([]byte(expectedSig), []byte(providedSig)) {
		return "", fmt.Errorf("presigned signature mismatch")
	}

	return accessKeyID, nil
}

// GeneratePresignedURL generates a presigned URL for the given request parameters.
func (p *PresignedVerifier) GeneratePresignedURL(
	method, scheme, host, path string,
	accessKeyID string,
	expires time.Duration,
	extraHeaders map[string]string,
) (string, error) {
	cred, ok := p.credStore.GetCredential(accessKeyID)
	if !ok {
		return "", fmt.Errorf("unknown access key: %s", accessKeyID)
	}

	now := time.Now().UTC()
	date := now.Format(DateFormat)
	credentialScope := fmt.Sprintf("%s/%s/%s/%s", date, p.region, ServiceName, TerminationString)
	credential := fmt.Sprintf("%s/%s", accessKeyID, credentialScope)

	// Build signed headers
	signedHeaders := []string{"host"}
	for k := range extraHeaders {
		signedHeaders = append(signedHeaders, strings.ToLower(k))
	}
	sort.Strings(signedHeaders)

	// Build query parameters
	query := url.Values{
		"X-Amz-Algorithm":     {SignatureV4Algorithm},
		"X-Amz-Credential":    {credential},
		"X-Amz-Date":          {now.Format(TimeFormat)},
		"X-Amz-Expires":       {strconv.Itoa(int(expires.Seconds()))},
		"X-Amz-SignedHeaders":  {strings.Join(signedHeaders, ";")},
	}

	// Build canonical request
	canonicalURI := canonicalizePath(path)
	canonicalQuery := canonicalizeQueryString(query)

	var headerLines []string
	for _, h := range signedHeaders {
		if h == "host" {
			headerLines = append(headerLines, "host:"+host)
		} else if v, ok := extraHeaders[h]; ok {
			headerLines = append(headerLines, h+":"+strings.TrimSpace(v))
		}
	}
	canonicalHeaders := strings.Join(headerLines, "\n") + "\n"

	canonicalRequest := strings.Join([]string{
		method,
		canonicalURI,
		canonicalQuery,
		canonicalHeaders,
		strings.Join(signedHeaders, ";"),
		UnsignedPayload,
	}, "\n")

	// Sign
	stringToSign := buildStringToSign(now, credentialScope, canonicalRequest)
	signingKey := deriveSigningKey(cred.SecretAccessKey, date, p.region, ServiceName)
	signature := hex.EncodeToString(hmacSHA256(signingKey, []byte(stringToSign)))

	query.Set("X-Amz-Signature", signature)

	u := &url.URL{
		Scheme:   scheme,
		Host:     host,
		Path:     path,
		RawQuery: query.Encode(),
	}

	return u.String(), nil
}

// buildPresignedCanonicalRequest builds the canonical request for a presigned URL.
func buildPresignedCanonicalRequest(r *http.Request, query url.Values, signedHeaders []string) string {
	method := r.Method
	canonicalURI := canonicalizePath(r.URL.Path)
	canonicalQuery := canonicalizeQueryString(query)

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

	return strings.Join([]string{
		method,
		canonicalURI,
		canonicalQuery,
		canonicalHeaders,
		strings.Join(signedHeaders, ";"),
		UnsignedPayload,
	}, "\n")
}
