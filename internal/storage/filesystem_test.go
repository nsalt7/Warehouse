package storage

import (
	"bytes"
	"io"
	"os"
	"testing"
	"time"
)

func setupTestFS(t *testing.T) *Filesystem {
	t.Helper()
	dir := t.TempDir()
	fs, err := NewFilesystem(dir)
	if err != nil {
		t.Fatalf("NewFilesystem: %v", err)
	}
	return fs
}

func TestCreateAndListBuckets(t *testing.T) {
	fs := setupTestFS(t)

	meta := BucketMetadata{
		Name:      "test-bucket",
		CreatedAt: time.Now().UTC(),
		Owner:     "testuser",
		Region:    "us-east-1",
	}

	if err := fs.CreateBucket("test-bucket", meta); err != nil {
		t.Fatalf("CreateBucket: %v", err)
	}

	// Duplicate should fail
	if err := fs.CreateBucket("test-bucket", meta); err == nil {
		t.Fatal("expected error on duplicate bucket creation")
	}

	buckets, err := fs.ListBuckets()
	if err != nil {
		t.Fatalf("ListBuckets: %v", err)
	}
	if len(buckets) != 1 {
		t.Fatalf("expected 1 bucket, got %d", len(buckets))
	}
	if buckets[0].Name != "test-bucket" {
		t.Fatalf("expected bucket name 'test-bucket', got %q", buckets[0].Name)
	}
}

func TestGetBucket(t *testing.T) {
	fs := setupTestFS(t)

	_, err := fs.GetBucket("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent bucket")
	}

	meta := BucketMetadata{
		Name:      "my-bucket",
		CreatedAt: time.Now().UTC(),
		Owner:     "testuser",
		Region:    "ap-southeast-2",
	}
	if err := fs.CreateBucket("my-bucket", meta); err != nil {
		t.Fatalf("CreateBucket: %v", err)
	}

	got, err := fs.GetBucket("my-bucket")
	if err != nil {
		t.Fatalf("GetBucket: %v", err)
	}
	if got.Region != "ap-southeast-2" {
		t.Fatalf("expected region 'ap-southeast-2', got %q", got.Region)
	}
}

func TestDeleteBucket(t *testing.T) {
	fs := setupTestFS(t)

	meta := BucketMetadata{Name: "del-bucket", CreatedAt: time.Now().UTC(), Owner: "test"}
	fs.CreateBucket("del-bucket", meta)

	if err := fs.DeleteBucket("del-bucket"); err != nil {
		t.Fatalf("DeleteBucket: %v", err)
	}

	_, err := fs.GetBucket("del-bucket")
	if err == nil {
		t.Fatal("expected error after deletion")
	}
}

func TestDeleteBucketNotEmpty(t *testing.T) {
	fs := setupTestFS(t)

	meta := BucketMetadata{Name: "notempty", CreatedAt: time.Now().UTC(), Owner: "test"}
	fs.CreateBucket("notempty", meta)

	objMeta := ObjectMetadata{Key: "file.txt", ContentType: "text/plain"}
	_, err := fs.PutObject("notempty", objMeta, bytes.NewReader([]byte("hello")))
	if err != nil {
		t.Fatalf("PutObject: %v", err)
	}

	if err := fs.DeleteBucket("notempty"); err == nil {
		t.Fatal("expected error deleting non-empty bucket")
	}
}

func TestPutGetObject(t *testing.T) {
	fs := setupTestFS(t)
	fs.CreateBucket("data", BucketMetadata{Name: "data", CreatedAt: time.Now().UTC(), Owner: "test"})

	content := []byte("Hello, Warehouse!")
	objMeta := ObjectMetadata{
		Key:         "greeting.txt",
		ContentType: "text/plain",
		UserMetadata: map[string]string{
			"author": "test",
		},
	}

	result, err := fs.PutObject("data", objMeta, bytes.NewReader(content))
	if err != nil {
		t.Fatalf("PutObject: %v", err)
	}

	if result.Size != int64(len(content)) {
		t.Fatalf("expected size %d, got %d", len(content), result.Size)
	}
	if result.ETag == "" {
		t.Fatal("expected non-empty ETag")
	}

	// Get object
	meta, reader, err := fs.GetObject("data", "greeting.txt", "")
	if err != nil {
		t.Fatalf("GetObject: %v", err)
	}
	defer reader.Close()

	data, _ := io.ReadAll(reader)
	if string(data) != "Hello, Warehouse!" {
		t.Fatalf("expected 'Hello, Warehouse!', got %q", string(data))
	}
	if meta.ContentType != "text/plain" {
		t.Fatalf("expected content-type 'text/plain', got %q", meta.ContentType)
	}
	if meta.UserMetadata["author"] != "test" {
		t.Fatalf("expected user metadata 'author'='test'")
	}
}

func TestHeadObject(t *testing.T) {
	fs := setupTestFS(t)
	fs.CreateBucket("data", BucketMetadata{Name: "data", CreatedAt: time.Now().UTC(), Owner: "test"})

	content := []byte("head test")
	fs.PutObject("data", ObjectMetadata{Key: "file.bin", ContentType: "application/octet-stream"}, bytes.NewReader(content))

	meta, err := fs.HeadObject("data", "file.bin", "")
	if err != nil {
		t.Fatalf("HeadObject: %v", err)
	}
	if meta.Size != int64(len(content)) {
		t.Fatalf("expected size %d, got %d", len(content), meta.Size)
	}
}

func TestDeleteObject(t *testing.T) {
	fs := setupTestFS(t)
	fs.CreateBucket("data", BucketMetadata{Name: "data", CreatedAt: time.Now().UTC(), Owner: "test"})
	fs.PutObject("data", ObjectMetadata{Key: "to-delete.txt"}, bytes.NewReader([]byte("bye")))

	_, err := fs.DeleteObject("data", "to-delete.txt", "")
	if err != nil {
		t.Fatalf("DeleteObject: %v", err)
	}

	_, err = fs.HeadObject("data", "to-delete.txt", "")
	if err == nil {
		t.Fatal("expected error after deletion")
	}
}

func TestListObjects(t *testing.T) {
	fs := setupTestFS(t)
	fs.CreateBucket("list", BucketMetadata{Name: "list", CreatedAt: time.Now().UTC(), Owner: "test"})

	keys := []string{"a/1.txt", "a/2.txt", "b/1.txt", "c.txt"}
	for _, k := range keys {
		fs.PutObject("list", ObjectMetadata{Key: k}, bytes.NewReader([]byte("x")))
	}

	// List all
	result, err := fs.ListObjects("list", ListObjectsOptions{MaxKeys: 1000})
	if err != nil {
		t.Fatalf("ListObjects: %v", err)
	}
	if len(result.Objects) != 4 {
		t.Fatalf("expected 4 objects, got %d", len(result.Objects))
	}

	// List with prefix
	result, err = fs.ListObjects("list", ListObjectsOptions{Prefix: "a/", MaxKeys: 1000})
	if err != nil {
		t.Fatalf("ListObjects with prefix: %v", err)
	}
	if len(result.Objects) != 2 {
		t.Fatalf("expected 2 objects with prefix 'a/', got %d", len(result.Objects))
	}

	// List with delimiter
	result, err = fs.ListObjects("list", ListObjectsOptions{Delimiter: "/", MaxKeys: 1000})
	if err != nil {
		t.Fatalf("ListObjects with delimiter: %v", err)
	}
	if len(result.Objects) != 1 {
		t.Fatalf("expected 1 direct object, got %d", len(result.Objects))
	}
	if len(result.CommonPrefixes) != 2 {
		t.Fatalf("expected 2 common prefixes, got %d", len(result.CommonPrefixes))
	}

	// List with max-keys pagination
	result, err = fs.ListObjects("list", ListObjectsOptions{MaxKeys: 2})
	if err != nil {
		t.Fatalf("ListObjects paginated: %v", err)
	}
	if !result.IsTruncated {
		t.Fatal("expected truncated result")
	}
}

func TestVersioning(t *testing.T) {
	fs := setupTestFS(t)

	meta := BucketMetadata{
		Name: "versioned", CreatedAt: time.Now().UTC(), Owner: "test",
		Versioning: "Enabled",
	}
	fs.CreateBucket("versioned", meta)

	// Put v1
	v1, _ := fs.PutObject("versioned", ObjectMetadata{Key: "doc.txt"}, bytes.NewReader([]byte("v1")))
	// Put v2
	v2, _ := fs.PutObject("versioned", ObjectMetadata{Key: "doc.txt"}, bytes.NewReader([]byte("v2")))

	if v1.VersionID == v2.VersionID {
		t.Fatal("version IDs should differ")
	}

	// Get latest should return v2
	got, reader, _ := fs.GetObject("versioned", "doc.txt", "")
	data, _ := io.ReadAll(reader)
	reader.Close()
	if string(data) != "v2" {
		t.Fatalf("expected 'v2', got %q", string(data))
	}
	if got.VersionID != v2.VersionID {
		t.Fatal("latest should be v2")
	}

	// Get specific version v1
	_, reader, _ = fs.GetObject("versioned", "doc.txt", v1.VersionID)
	data, _ = io.ReadAll(reader)
	reader.Close()
	if string(data) != "v1" {
		t.Fatalf("expected 'v1', got %q", string(data))
	}

	// Delete (should create delete marker)
	dm, _ := fs.DeleteObject("versioned", "doc.txt", "")
	if !dm.IsDeleteMarker {
		t.Fatal("expected delete marker")
	}

	// Get should now fail
	_, _, err := fs.GetObject("versioned", "doc.txt", "")
	if err == nil {
		t.Fatal("expected error after delete marker")
	}

	// List versions should show all versions + delete marker
	versions, _ := fs.ListObjectVersions("versioned", ListVersionsOptions{MaxKeys: 100})
	if len(versions.Versions) != 3 { // 2 versions + 1 delete marker
		t.Fatalf("expected 3 versions, got %d", len(versions.Versions))
	}
}

func TestCopyObject(t *testing.T) {
	fs := setupTestFS(t)
	fs.CreateBucket("src", BucketMetadata{Name: "src", CreatedAt: time.Now().UTC(), Owner: "test"})
	fs.CreateBucket("dst", BucketMetadata{Name: "dst", CreatedAt: time.Now().UTC(), Owner: "test"})

	content := []byte("copy me")
	fs.PutObject("src", ObjectMetadata{Key: "original.txt", ContentType: "text/plain"}, bytes.NewReader(content))

	result, err := fs.CopyObject("src", "original.txt", "", "dst", "copy.txt")
	if err != nil {
		t.Fatalf("CopyObject: %v", err)
	}
	if result.Size != int64(len(content)) {
		t.Fatalf("expected size %d, got %d", len(content), result.Size)
	}

	// Verify copy content
	_, reader, _ := fs.GetObject("dst", "copy.txt", "")
	data, _ := io.ReadAll(reader)
	reader.Close()
	if string(data) != "copy me" {
		t.Fatalf("expected 'copy me', got %q", string(data))
	}
}

func TestMultipartUpload(t *testing.T) {
	fs := setupTestFS(t)
	fs.CreateBucket("mp", BucketMetadata{Name: "mp", CreatedAt: time.Now().UTC(), Owner: "test"})

	upload := MultipartUpload{
		UploadID:  "test-upload-1",
		Bucket:    "mp",
		Key:       "large.bin",
		Initiator: "test",
		CreatedAt: time.Now().UTC(),
	}
	if err := fs.CreateMultipartUpload(upload); err != nil {
		t.Fatalf("CreateMultipartUpload: %v", err)
	}

	// Upload parts
	part1Data := bytes.Repeat([]byte("A"), 1024)
	part2Data := bytes.Repeat([]byte("B"), 1024)

	p1, err := fs.UploadPart("mp", "large.bin", "test-upload-1", 1, bytes.NewReader(part1Data))
	if err != nil {
		t.Fatalf("UploadPart 1: %v", err)
	}
	if p1.Size != 1024 {
		t.Fatalf("expected part 1 size 1024, got %d", p1.Size)
	}

	p2, err := fs.UploadPart("mp", "large.bin", "test-upload-1", 2, bytes.NewReader(part2Data))
	if err != nil {
		t.Fatalf("UploadPart 2: %v", err)
	}

	// List parts
	parts, truncated, err := fs.ListParts("mp", "large.bin", "test-upload-1", 100, 0)
	if err != nil {
		t.Fatalf("ListParts: %v", err)
	}
	if len(parts) != 2 {
		t.Fatalf("expected 2 parts, got %d", len(parts))
	}
	if truncated {
		t.Fatal("should not be truncated")
	}

	// Complete
	result, err := fs.CompleteMultipartUpload("mp", "large.bin", "test-upload-1", []int{1, 2})
	if err != nil {
		t.Fatalf("CompleteMultipartUpload: %v", err)
	}
	if result.Size != 2048 {
		t.Fatalf("expected assembled size 2048, got %d", result.Size)
	}

	// Verify content
	_, reader, _ := fs.GetObject("mp", "large.bin", "")
	data, _ := io.ReadAll(reader)
	reader.Close()
	if len(data) != 2048 {
		t.Fatalf("expected 2048 bytes, got %d", len(data))
	}

	_ = p2
}

func TestAbortMultipartUpload(t *testing.T) {
	fs := setupTestFS(t)
	fs.CreateBucket("mp", BucketMetadata{Name: "mp", CreatedAt: time.Now().UTC(), Owner: "test"})

	upload := MultipartUpload{
		UploadID: "abort-me", Bucket: "mp", Key: "file.bin",
		Initiator: "test", CreatedAt: time.Now().UTC(),
	}
	fs.CreateMultipartUpload(upload)
	fs.UploadPart("mp", "file.bin", "abort-me", 1, bytes.NewReader([]byte("data")))

	if err := fs.AbortMultipartUpload("mp", "file.bin", "abort-me"); err != nil {
		t.Fatalf("AbortMultipartUpload: %v", err)
	}

	// Should fail to upload more parts
	_, err := fs.UploadPart("mp", "file.bin", "abort-me", 2, bytes.NewReader([]byte("more")))
	if err == nil {
		t.Fatal("expected error after abort")
	}
}

func TestContentAddressableDedup(t *testing.T) {
	fs := setupTestFS(t)
	fs.CreateBucket("dedup", BucketMetadata{Name: "dedup", CreatedAt: time.Now().UTC(), Owner: "test"})

	content := []byte("same content")

	r1, _ := fs.PutObject("dedup", ObjectMetadata{Key: "file1.txt"}, bytes.NewReader(content))
	r2, _ := fs.PutObject("dedup", ObjectMetadata{Key: "file2.txt"}, bytes.NewReader(content))

	// Both should reference the same blob
	if r1.BlobRef != r2.BlobRef {
		t.Fatal("expected same blob ref for identical content")
	}
	if r1.ETag != r2.ETag {
		t.Fatal("expected same ETag for identical content")
	}
}

func TestPersistenceAcrossReload(t *testing.T) {
	dir := t.TempDir()

	// Create and populate
	fs1, _ := NewFilesystem(dir)
	fs1.CreateBucket("persist", BucketMetadata{Name: "persist", CreatedAt: time.Now().UTC(), Owner: "test"})
	fs1.PutObject("persist", ObjectMetadata{Key: "data.txt"}, bytes.NewReader([]byte("persisted")))

	// Reload from same directory
	fs2, err := NewFilesystem(dir)
	if err != nil {
		t.Fatalf("NewFilesystem reload: %v", err)
	}

	buckets, _ := fs2.ListBuckets()
	if len(buckets) != 1 {
		t.Fatalf("expected 1 bucket after reload, got %d", len(buckets))
	}

	meta, reader, err := fs2.GetObject("persist", "data.txt", "")
	if err != nil {
		t.Fatalf("GetObject after reload: %v", err)
	}
	defer reader.Close()

	data, _ := io.ReadAll(reader)
	if string(data) != "persisted" {
		t.Fatalf("expected 'persisted', got %q", string(data))
	}
	_ = meta
}

func TestGetExpiredObjects(t *testing.T) {
	fs := setupTestFS(t)

	meta := BucketMetadata{Name: "lifecycle", CreatedAt: time.Now().UTC(), Owner: "test"}
	fs.CreateBucket("lifecycle", meta)

	// Put an object with a fake old timestamp
	objMeta := ObjectMetadata{Key: "old.txt", ContentType: "text/plain"}
	result, _ := fs.PutObject("lifecycle", objMeta, bytes.NewReader([]byte("old data")))

	// Manually backdate the object
	bs := fs.buckets["lifecycle"]
	bs.mu.Lock()
	bs.objects["old.txt"][0].LastModified = time.Now().Add(-48 * time.Hour)
	bs.mu.Unlock()

	rules := []LifecycleRule{{
		ID: "expire-1day", Status: "Enabled",
		ExpirationDays: 1,
	}}

	expired, err := fs.GetExpiredObjects("lifecycle", rules, time.Now())
	if err != nil {
		t.Fatalf("GetExpiredObjects: %v", err)
	}
	if len(expired) != 1 {
		t.Fatalf("expected 1 expired object, got %d", len(expired))
	}
	if expired[0].Key != "old.txt" {
		t.Fatalf("expected 'old.txt', got %q", expired[0].Key)
	}

	// Verify non-expired objects are not returned
	fs.PutObject("lifecycle", ObjectMetadata{Key: "new.txt"}, bytes.NewReader([]byte("new data")))
	expired, _ = fs.GetExpiredObjects("lifecycle", rules, time.Now())
	if len(expired) != 1 {
		t.Fatalf("expected still 1 expired object, got %d", len(expired))
	}

	_ = result
	_ = os.Remove // suppress unused import
}
