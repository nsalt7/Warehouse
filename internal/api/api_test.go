package api

import (
	"bytes"
	"encoding/xml"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/warehouse/warehouse/internal/auth"
	"github.com/warehouse/warehouse/internal/storage"
	"github.com/warehouse/warehouse/pkg/s3types"
)

// testServer sets up a test HTTP server with simple auth mode for easy testing.
func testServer(t *testing.T) (*httptest.Server, *storage.Filesystem) {
	t.Helper()
	dir := t.TempDir()

	store, err := storage.NewFilesystem(dir)
	if err != nil {
		t.Fatalf("NewFilesystem: %v", err)
	}

	credPath := dir + "/creds.json"
	credStore, err := auth.NewCredentialStore(credPath)
	if err != nil {
		t.Fatalf("NewCredentialStore: %v", err)
	}
	credStore.EnsureDefault("TESTKEY", "TESTSECRET")

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))

	handler := NewRouter(RouterConfig{
		Store:     store,
		CredStore: credStore,
		SigV4:     auth.NewSigV4Verifier(credStore, "us-east-1"),
		Presigned: auth.NewPresignedVerifier(credStore, "us-east-1"),
		Logger:    logger,
		Region:    "us-east-1",
		AuthMode:  "simple",
	})

	ts := httptest.NewServer(handler)
	return ts, store
}

// authReq creates an authenticated request with simple auth headers.
func authReq(method, url string, body io.Reader) *http.Request {
	req, _ := http.NewRequest(method, url, body)
	req.Header.Set("X-Warehouse-Access-Key", "TESTKEY")
	req.Header.Set("X-Warehouse-Secret-Key", "TESTSECRET")
	return req
}

func TestHealthEndpoint(t *testing.T) {
	ts, _ := testServer(t)
	defer ts.Close()

	// Health check does not require auth (it goes through /health route before auth middleware for GET)
	// Actually our middleware wraps everything, so we need auth even for health
	req := authReq("GET", ts.URL+"/health", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET /health: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestCreateAndListBuckets(t *testing.T) {
	ts, _ := testServer(t)
	defer ts.Close()

	// Create bucket
	req := authReq("PUT", ts.URL+"/test-bucket", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("PUT /test-bucket: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	// List buckets
	req = authReq("GET", ts.URL+"/", nil)
	resp, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET /: %v", err)
	}
	defer resp.Body.Close()

	var result s3types.ListAllMyBucketsResult
	body, _ := io.ReadAll(resp.Body)
	xml.Unmarshal(body, &result)

	if len(result.Buckets) != 1 {
		t.Fatalf("expected 1 bucket, got %d", len(result.Buckets))
	}
	if result.Buckets[0].Name != "test-bucket" {
		t.Fatalf("expected 'test-bucket', got %q", result.Buckets[0].Name)
	}
}

func TestCreateBucketInvalidName(t *testing.T) {
	ts, _ := testServer(t)
	defer ts.Close()

	req := authReq("PUT", ts.URL+"/INVALID_BUCKET", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("PUT: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}

func TestDeleteBucket(t *testing.T) {
	ts, _ := testServer(t)
	defer ts.Close()

	// Create
	req := authReq("PUT", ts.URL+"/del-bucket", nil)
	resp, _ := http.DefaultClient.Do(req)
	resp.Body.Close()

	// Delete
	req = authReq("DELETE", ts.URL+"/del-bucket", nil)
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}

	// List should be empty
	req = authReq("GET", ts.URL+"/", nil)
	resp, _ = http.DefaultClient.Do(req)
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	var result s3types.ListAllMyBucketsResult
	xml.Unmarshal(body, &result)
	if len(result.Buckets) != 0 {
		t.Fatalf("expected 0 buckets, got %d", len(result.Buckets))
	}
}

func TestPutGetObject(t *testing.T) {
	ts, _ := testServer(t)
	defer ts.Close()

	// Create bucket
	req := authReq("PUT", ts.URL+"/data", nil)
	resp, _ := http.DefaultClient.Do(req)
	resp.Body.Close()

	// Put object
	content := "Hello, World!"
	req = authReq("PUT", ts.URL+"/data/greeting.txt", strings.NewReader(content))
	req.Header.Set("Content-Type", "text/plain")
	req.Header.Set("X-Amz-Meta-Author", "tester")
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PUT object: expected 200, got %d", resp.StatusCode)
	}

	etag := resp.Header.Get("ETag")
	if etag == "" {
		t.Fatal("expected ETag header")
	}

	// Get object
	req = authReq("GET", ts.URL+"/data/greeting.txt", nil)
	resp, _ = http.DefaultClient.Do(req)
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET object: expected 200, got %d", resp.StatusCode)
	}
	if string(body) != content {
		t.Fatalf("expected %q, got %q", content, string(body))
	}
	if resp.Header.Get("Content-Type") != "text/plain" {
		t.Fatalf("expected Content-Type 'text/plain', got %q", resp.Header.Get("Content-Type"))
	}
	if resp.Header.Get("X-Amz-Meta-Author") != "tester" {
		t.Fatalf("expected X-Amz-Meta-Author 'tester'")
	}
}

func TestHeadObject(t *testing.T) {
	ts, _ := testServer(t)
	defer ts.Close()

	req := authReq("PUT", ts.URL+"/head-test", nil)
	resp, _ := http.DefaultClient.Do(req)
	resp.Body.Close()

	req = authReq("PUT", ts.URL+"/head-test/file.bin", bytes.NewReader([]byte("binary data")))
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()

	req = authReq("HEAD", ts.URL+"/head-test/file.bin", nil)
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("HEAD: expected 200, got %d", resp.StatusCode)
	}
	if resp.Header.Get("Content-Length") != "11" {
		t.Fatalf("expected Content-Length 11, got %q", resp.Header.Get("Content-Length"))
	}
}

func TestDeleteObject(t *testing.T) {
	ts, _ := testServer(t)
	defer ts.Close()

	req := authReq("PUT", ts.URL+"/del-obj", nil)
	resp, _ := http.DefaultClient.Do(req)
	resp.Body.Close()

	req = authReq("PUT", ts.URL+"/del-obj/file.txt", strings.NewReader("delete me"))
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()

	req = authReq("DELETE", ts.URL+"/del-obj/file.txt", nil)
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("DELETE: expected 204, got %d", resp.StatusCode)
	}

	// GET should 404
	req = authReq("GET", ts.URL+"/del-obj/file.txt", nil)
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("GET after delete: expected 404, got %d", resp.StatusCode)
	}
}

func TestListObjectsV2(t *testing.T) {
	ts, _ := testServer(t)
	defer ts.Close()

	req := authReq("PUT", ts.URL+"/list-test", nil)
	resp, _ := http.DefaultClient.Do(req)
	resp.Body.Close()

	keys := []string{"docs/a.txt", "docs/b.txt", "images/photo.jpg", "readme.md"}
	for _, k := range keys {
		req = authReq("PUT", ts.URL+"/list-test/"+k, strings.NewReader("content"))
		resp, _ = http.DefaultClient.Do(req)
		resp.Body.Close()
	}

	// List all
	req = authReq("GET", ts.URL+"/list-test?list-type=2", nil)
	resp, _ = http.DefaultClient.Do(req)
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	var result s3types.ListBucketResult
	xml.Unmarshal(body, &result)

	if result.KeyCount != 4 {
		t.Fatalf("expected KeyCount 4, got %d", result.KeyCount)
	}

	// List with prefix
	req = authReq("GET", ts.URL+"/list-test?list-type=2&prefix=docs/", nil)
	resp, _ = http.DefaultClient.Do(req)
	body, _ = io.ReadAll(resp.Body)
	resp.Body.Close()

	xml.Unmarshal(body, &result)
	if result.KeyCount != 2 {
		t.Fatalf("expected KeyCount 2 with prefix, got %d", result.KeyCount)
	}

	// List with delimiter
	req = authReq("GET", ts.URL+"/list-test?list-type=2&delimiter=/", nil)
	resp, _ = http.DefaultClient.Do(req)
	body, _ = io.ReadAll(resp.Body)
	resp.Body.Close()

	xml.Unmarshal(body, &result)
	if len(result.CommonPrefixes) != 2 {
		t.Fatalf("expected 2 common prefixes, got %d", len(result.CommonPrefixes))
	}
}

func TestCopyObject(t *testing.T) {
	ts, _ := testServer(t)
	defer ts.Close()

	// Create buckets
	for _, b := range []string{"src-bucket", "dst-bucket"} {
		req := authReq("PUT", ts.URL+"/"+b, nil)
		resp, _ := http.DefaultClient.Do(req)
		resp.Body.Close()
	}

	// Put source object
	req := authReq("PUT", ts.URL+"/src-bucket/original.txt", strings.NewReader("copy this"))
	resp, _ := http.DefaultClient.Do(req)
	resp.Body.Close()

	// Copy
	req = authReq("PUT", ts.URL+"/dst-bucket/copied.txt", nil)
	req.Header.Set("X-Amz-Copy-Source", "/src-bucket/original.txt")
	resp, _ = http.DefaultClient.Do(req)
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("COPY: expected 200, got %d; body: %s", resp.StatusCode, body)
	}

	// Verify copy
	req = authReq("GET", ts.URL+"/dst-bucket/copied.txt", nil)
	resp, _ = http.DefaultClient.Do(req)
	data, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	if string(data) != "copy this" {
		t.Fatalf("expected 'copy this', got %q", string(data))
	}
}

func TestVersioning(t *testing.T) {
	ts, _ := testServer(t)
	defer ts.Close()

	// Create bucket
	req := authReq("PUT", ts.URL+"/ver-bucket", nil)
	resp, _ := http.DefaultClient.Do(req)
	resp.Body.Close()

	// Enable versioning
	versioningXML := `<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>`
	req = authReq("PUT", ts.URL+"/ver-bucket?versioning", strings.NewReader(versioningXML))
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PUT versioning: expected 200, got %d", resp.StatusCode)
	}

	// Verify versioning status
	req = authReq("GET", ts.URL+"/ver-bucket?versioning", nil)
	resp, _ = http.DefaultClient.Do(req)
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	var vc s3types.VersioningConfiguration
	xml.Unmarshal(body, &vc)
	if vc.Status != "Enabled" {
		t.Fatalf("expected 'Enabled', got %q", vc.Status)
	}

	// Put two versions
	req = authReq("PUT", ts.URL+"/ver-bucket/doc.txt", strings.NewReader("v1"))
	resp, _ = http.DefaultClient.Do(req)
	v1ID := resp.Header.Get("x-amz-version-id")
	resp.Body.Close()

	req = authReq("PUT", ts.URL+"/ver-bucket/doc.txt", strings.NewReader("v2"))
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()

	// Get latest
	req = authReq("GET", ts.URL+"/ver-bucket/doc.txt", nil)
	resp, _ = http.DefaultClient.Do(req)
	data, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	if string(data) != "v2" {
		t.Fatalf("expected 'v2', got %q", string(data))
	}

	// Get v1 by version ID
	if v1ID != "" {
		req = authReq("GET", ts.URL+"/ver-bucket/doc.txt?versionId="+v1ID, nil)
		resp, _ = http.DefaultClient.Do(req)
		data, _ = io.ReadAll(resp.Body)
		resp.Body.Close()

		if string(data) != "v1" {
			t.Fatalf("expected 'v1', got %q", string(data))
		}
	}
}

func TestMultipartUpload(t *testing.T) {
	ts, _ := testServer(t)
	defer ts.Close()

	req := authReq("PUT", ts.URL+"/mp-bucket", nil)
	resp, _ := http.DefaultClient.Do(req)
	resp.Body.Close()

	// Initiate
	req = authReq("POST", ts.URL+"/mp-bucket/big-file.bin?uploads", nil)
	resp, _ = http.DefaultClient.Do(req)
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	var initResult s3types.InitiateMultipartUploadResult
	xml.Unmarshal(body, &initResult)

	if initResult.UploadId == "" {
		t.Fatal("expected non-empty upload ID")
	}
	uploadID := initResult.UploadId

	// Upload parts
	part1 := bytes.Repeat([]byte("X"), 512)
	req = authReq("PUT", ts.URL+"/mp-bucket/big-file.bin?partNumber=1&uploadId="+uploadID, bytes.NewReader(part1))
	resp, _ = http.DefaultClient.Do(req)
	etag1 := resp.Header.Get("ETag")
	resp.Body.Close()

	part2 := bytes.Repeat([]byte("Y"), 512)
	req = authReq("PUT", ts.URL+"/mp-bucket/big-file.bin?partNumber=2&uploadId="+uploadID, bytes.NewReader(part2))
	resp, _ = http.DefaultClient.Do(req)
	etag2 := resp.Header.Get("ETag")
	resp.Body.Close()

	// Complete
	completeXML := `<CompleteMultipartUpload>
		<Part><PartNumber>1</PartNumber><ETag>` + etag1 + `</ETag></Part>
		<Part><PartNumber>2</PartNumber><ETag>` + etag2 + `</ETag></Part>
	</CompleteMultipartUpload>`

	req = authReq("POST", ts.URL+"/mp-bucket/big-file.bin?uploadId="+uploadID, strings.NewReader(completeXML))
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Complete: expected 200, got %d", resp.StatusCode)
	}

	// Verify assembled object
	req = authReq("GET", ts.URL+"/mp-bucket/big-file.bin", nil)
	resp, _ = http.DefaultClient.Do(req)
	data, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	if len(data) != 1024 {
		t.Fatalf("expected 1024 bytes, got %d", len(data))
	}
}

func TestBucketPolicy(t *testing.T) {
	ts, _ := testServer(t)
	defer ts.Close()

	req := authReq("PUT", ts.URL+"/policy-bucket", nil)
	resp, _ := http.DefaultClient.Do(req)
	resp.Body.Close()

	// Put policy
	policy := `{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":"*","Action":"s3:GetObject","Resource":"arn:aws:s3:::policy-bucket/*"}]}`
	req = authReq("PUT", ts.URL+"/policy-bucket?policy", strings.NewReader(policy))
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("PUT policy: expected 204, got %d", resp.StatusCode)
	}

	// Get policy
	req = authReq("GET", ts.URL+"/policy-bucket?policy", nil)
	resp, _ = http.DefaultClient.Do(req)
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET policy: expected 200, got %d", resp.StatusCode)
	}
	if !strings.Contains(string(body), "s3:GetObject") {
		t.Fatal("policy content mismatch")
	}

	// Delete policy
	req = authReq("DELETE", ts.URL+"/policy-bucket?policy", nil)
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("DELETE policy: expected 204, got %d", resp.StatusCode)
	}
}

func TestLifecycleConfig(t *testing.T) {
	ts, _ := testServer(t)
	defer ts.Close()

	req := authReq("PUT", ts.URL+"/lc-bucket", nil)
	resp, _ := http.DefaultClient.Do(req)
	resp.Body.Close()

	// Put lifecycle
	lcXML := `<LifecycleConfiguration>
		<Rule>
			<ID>expire-logs</ID>
			<Status>Enabled</Status>
			<Filter><Prefix>logs/</Prefix></Filter>
			<Expiration><Days>30</Days></Expiration>
		</Rule>
	</LifecycleConfiguration>`

	req = authReq("PUT", ts.URL+"/lc-bucket?lifecycle", strings.NewReader(lcXML))
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("PUT lifecycle: expected 200, got %d", resp.StatusCode)
	}

	// Get lifecycle
	req = authReq("GET", ts.URL+"/lc-bucket?lifecycle", nil)
	resp, _ = http.DefaultClient.Do(req)
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET lifecycle: expected 200, got %d", resp.StatusCode)
	}
	if !strings.Contains(string(body), "expire-logs") {
		t.Fatal("lifecycle config mismatch")
	}
}

func TestAuthRequired(t *testing.T) {
	ts, _ := testServer(t)
	defer ts.Close()

	// Request without auth headers
	resp, err := http.Get(ts.URL + "/")
	if err != nil {
		t.Fatalf("GET: %v", err)
	}
	resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", resp.StatusCode)
	}
}

func TestGetNonexistentObject(t *testing.T) {
	ts, _ := testServer(t)
	defer ts.Close()

	req := authReq("PUT", ts.URL+"/err-bucket", nil)
	resp, _ := http.DefaultClient.Do(req)
	resp.Body.Close()

	req = authReq("GET", ts.URL+"/err-bucket/no-such-key", nil)
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()

	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", resp.StatusCode)
	}
}

func TestRangeRequest(t *testing.T) {
	ts, _ := testServer(t)
	defer ts.Close()

	req := authReq("PUT", ts.URL+"/range-bucket", nil)
	resp, _ := http.DefaultClient.Do(req)
	resp.Body.Close()

	content := "0123456789ABCDEF"
	req = authReq("PUT", ts.URL+"/range-bucket/data.txt", strings.NewReader(content))
	resp, _ = http.DefaultClient.Do(req)
	resp.Body.Close()

	// Request bytes 4-7
	req = authReq("GET", ts.URL+"/range-bucket/data.txt", nil)
	req.Header.Set("Range", "bytes=4-7")
	resp, _ = http.DefaultClient.Do(req)
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()

	if resp.StatusCode != http.StatusPartialContent {
		t.Fatalf("expected 206, got %d", resp.StatusCode)
	}
	if string(body) != "4567" {
		t.Fatalf("expected '4567', got %q", string(body))
	}
	if resp.Header.Get("Content-Range") != "bytes 4-7/16" {
		t.Fatalf("unexpected Content-Range: %q", resp.Header.Get("Content-Range"))
	}
}
