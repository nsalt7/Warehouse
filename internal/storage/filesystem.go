package storage

import (
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Filesystem implements Backend using local disk with content-addressable blob storage.
type Filesystem struct {
	rootDir string

	mu      sync.RWMutex            // protects bucket-level operations
	buckets map[string]*bucketState // in-memory bucket state
}

// bucketState holds the in-memory state for a single bucket.
type bucketState struct {
	mu       sync.RWMutex
	meta     BucketMetadata
	objects  map[string][]*ObjectMetadata // key → versions (newest first)
	uploads  map[string]*uploadState      // uploadID → state
}

// uploadState tracks an in-progress multipart upload.
type uploadState struct {
	info  MultipartUpload
	parts map[int]*PartMetadata
}

// NewFilesystem creates a new filesystem storage backend rooted at the given directory.
func NewFilesystem(rootDir string) (*Filesystem, error) {
	for _, dir := range []string{
		rootDir,
		filepath.Join(rootDir, "blobs"),
		filepath.Join(rootDir, "buckets"),
		filepath.Join(rootDir, "multipart"),
	} {
		if err := os.MkdirAll(dir, 0o750); err != nil {
			return nil, fmt.Errorf("creating directory %s: %w", dir, err)
		}
	}

	fs := &Filesystem{
		rootDir: rootDir,
		buckets: make(map[string]*bucketState),
	}

	if err := fs.loadAllBuckets(); err != nil {
		return nil, fmt.Errorf("loading existing buckets: %w", err)
	}

	return fs, nil
}

// ── Blob Storage ────────────────────────────────────────────────────────────

// blobPath returns the filesystem path for a content-addressable blob.
// Uses 2-level fan-out: ab/cd/<full-hash>.blob
func (f *Filesystem) blobPath(hash string) string {
	return filepath.Join(f.rootDir, "blobs", hash[:2], hash[2:4], hash+".blob")
}

// writeBlob writes data to content-addressable storage. Returns the SHA-256 hash,
// MD5 ETag, and size. If the blob already exists, it is not rewritten (dedup).
func (f *Filesystem) writeBlob(data io.Reader) (sha string, etag string, size int64, err error) {
	// Write to a temp file while computing hashes
	tmpFile, err := os.CreateTemp(filepath.Join(f.rootDir, "blobs"), ".tmp-*")
	if err != nil {
		return "", "", 0, fmt.Errorf("creating temp file: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer func() {
		if err != nil {
			tmpFile.Close()
			os.Remove(tmpPath)
		}
	}()

	shaHash := sha256.New()
	md5Hash := md5.New()
	w := io.MultiWriter(tmpFile, shaHash, md5Hash)

	size, err = io.Copy(w, data)
	if err != nil {
		return "", "", 0, fmt.Errorf("writing blob data: %w", err)
	}

	if err := tmpFile.Close(); err != nil {
		return "", "", 0, fmt.Errorf("closing temp file: %w", err)
	}

	sha = hex.EncodeToString(shaHash.Sum(nil))
	etag = hex.EncodeToString(md5Hash.Sum(nil))

	target := f.blobPath(sha)
	if _, err := os.Stat(target); err == nil {
		// Blob already exists (dedup)
		os.Remove(tmpPath)
		return sha, etag, size, nil
	}

	if err := os.MkdirAll(filepath.Dir(target), 0o750); err != nil {
		return "", "", 0, fmt.Errorf("creating blob directory: %w", err)
	}

	if err := os.Rename(tmpPath, target); err != nil {
		return "", "", 0, fmt.Errorf("moving blob to final location: %w", err)
	}

	return sha, etag, size, nil
}

// readBlob opens a blob for reading.
func (f *Filesystem) readBlob(hash string) (io.ReadCloser, error) {
	path := f.blobPath(hash)
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("opening blob %s: %w", hash, err)
	}
	return file, nil
}

// ── Persistence ─────────────────────────────────────────────────────────────

func (f *Filesystem) bucketDir(name string) string {
	return filepath.Join(f.rootDir, "buckets", name)
}

func (f *Filesystem) bucketConfigPath(name string) string {
	return filepath.Join(f.bucketDir(name), "config.json")
}

func (f *Filesystem) bucketIndexPath(name string) string {
	return filepath.Join(f.bucketDir(name), "index.json")
}

// persistBucketConfig writes bucket metadata to disk.
func (f *Filesystem) persistBucketConfig(bs *bucketState) error {
	data, err := json.MarshalIndent(bs.meta, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(f.bucketConfigPath(bs.meta.Name), data, 0o640)
}

// indexEntry is the on-disk format for the object index.
type indexEntry struct {
	Key      string            `json:"key"`
	Versions []*ObjectMetadata `json:"versions"`
}

// persistBucketIndex writes the object index to disk.
func (f *Filesystem) persistBucketIndex(bs *bucketState) error {
	entries := make([]indexEntry, 0, len(bs.objects))
	for key, versions := range bs.objects {
		entries = append(entries, indexEntry{Key: key, Versions: versions})
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].Key < entries[j].Key })

	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(f.bucketIndexPath(bs.meta.Name), data, 0o640)
}

// loadAllBuckets reads all bucket state from disk on startup.
func (f *Filesystem) loadAllBuckets() error {
	bucketsDir := filepath.Join(f.rootDir, "buckets")
	entries, err := os.ReadDir(bucketsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()

		bs := &bucketState{
			objects: make(map[string][]*ObjectMetadata),
			uploads: make(map[string]*uploadState),
		}

		// Load config
		configData, err := os.ReadFile(f.bucketConfigPath(name))
		if err != nil {
			return fmt.Errorf("loading bucket %s config: %w", name, err)
		}
		if err := json.Unmarshal(configData, &bs.meta); err != nil {
			return fmt.Errorf("parsing bucket %s config: %w", name, err)
		}

		// Load index
		indexData, err := os.ReadFile(f.bucketIndexPath(name))
		if err != nil {
			if !os.IsNotExist(err) {
				return fmt.Errorf("loading bucket %s index: %w", name, err)
			}
		} else {
			var entries []indexEntry
			if err := json.Unmarshal(indexData, &entries); err != nil {
				return fmt.Errorf("parsing bucket %s index: %w", name, err)
			}
			for _, e := range entries {
				bs.objects[e.Key] = e.Versions
			}
		}

		f.buckets[name] = bs
	}

	return nil
}

// ── Bucket Operations ───────────────────────────────────────────────────────

func (f *Filesystem) CreateBucket(name string, meta BucketMetadata) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	if _, exists := f.buckets[name]; exists {
		return fmt.Errorf("%w", ErrBucketExists)
	}

	if err := os.MkdirAll(f.bucketDir(name), 0o750); err != nil {
		return fmt.Errorf("creating bucket directory: %w", err)
	}

	// Set default ACL if not provided
	if meta.ACL == nil {
		meta.ACL = &ACLConfig{
			Grants: []ACLGrant{{
				GranteeType: "CanonicalUser",
				GranteeID:   meta.Owner,
				Permission:  "FULL_CONTROL",
			}},
		}
	}

	bs := &bucketState{
		meta:    meta,
		objects: make(map[string][]*ObjectMetadata),
		uploads: make(map[string]*uploadState),
	}

	if err := f.persistBucketConfig(bs); err != nil {
		os.RemoveAll(f.bucketDir(name))
		return fmt.Errorf("persisting bucket config: %w", err)
	}

	f.buckets[name] = bs
	return nil
}

func (f *Filesystem) GetBucket(name string) (*BucketMetadata, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	bs, exists := f.buckets[name]
	if !exists {
		return nil, fmt.Errorf("%w", ErrBucketNotFound)
	}

	bs.mu.RLock()
	defer bs.mu.RUnlock()

	meta := bs.meta
	return &meta, nil
}

func (f *Filesystem) DeleteBucket(name string) error {
	f.mu.Lock()
	defer f.mu.Unlock()

	bs, exists := f.buckets[name]
	if !exists {
		return fmt.Errorf("%w", ErrBucketNotFound)
	}

	bs.mu.RLock()
	objectCount := len(bs.objects)
	uploadCount := len(bs.uploads)
	bs.mu.RUnlock()

	if objectCount > 0 || uploadCount > 0 {
		return fmt.Errorf("%w", ErrBucketNotEmpty)
	}

	if err := os.RemoveAll(f.bucketDir(name)); err != nil {
		return fmt.Errorf("removing bucket directory: %w", err)
	}

	delete(f.buckets, name)
	return nil
}

func (f *Filesystem) ListBuckets() ([]BucketMetadata, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	result := make([]BucketMetadata, 0, len(f.buckets))
	for _, bs := range f.buckets {
		bs.mu.RLock()
		result = append(result, bs.meta)
		bs.mu.RUnlock()
	}

	sort.Slice(result, func(i, j int) bool { return result[i].Name < result[j].Name })
	return result, nil
}

func (f *Filesystem) UpdateBucket(name string, meta BucketMetadata) error {
	f.mu.RLock()
	bs, exists := f.buckets[name]
	f.mu.RUnlock()

	if !exists {
		return fmt.Errorf("%w", ErrBucketNotFound)
	}

	bs.mu.Lock()
	defer bs.mu.Unlock()

	bs.meta = meta
	return f.persistBucketConfig(bs)
}

// ── Object Operations ───────────────────────────────────────────────────────

func (f *Filesystem) getBucketState(name string) (*bucketState, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	bs, exists := f.buckets[name]
	if !exists {
		return nil, fmt.Errorf("%w", ErrBucketNotFound)
	}
	return bs, nil
}

func (f *Filesystem) PutObject(bucket string, meta ObjectMetadata, data io.Reader) (*ObjectMetadata, error) {
	bs, err := f.getBucketState(bucket)
	if err != nil {
		return nil, err
	}

	// Write blob
	sha, etag, size, err := f.writeBlob(data)
	if err != nil {
		return nil, fmt.Errorf("writing object data: %w", err)
	}

	bs.mu.Lock()
	defer bs.mu.Unlock()

	meta.BlobRef = sha
	meta.ETag = fmt.Sprintf("%q", etag)
	meta.Size = size
	meta.LastModified = time.Now().UTC()
	meta.StorageClass = "STANDARD"

	if meta.UserMetadata == nil {
		meta.UserMetadata = make(map[string]string)
	}

	// Handle versioning
	if bs.meta.Versioning == "Enabled" {
		meta.VersionID = uuid.New().String()
		meta.IsLatest = true
		// Mark previous versions as not latest
		if versions, exists := bs.objects[meta.Key]; exists {
			for _, v := range versions {
				v.IsLatest = false
			}
			bs.objects[meta.Key] = append([]*ObjectMetadata{&meta}, versions...)
		} else {
			bs.objects[meta.Key] = []*ObjectMetadata{&meta}
		}
	} else {
		meta.VersionID = "null"
		meta.IsLatest = true
		bs.objects[meta.Key] = []*ObjectMetadata{&meta}
	}

	if err := f.persistBucketIndex(bs); err != nil {
		return nil, fmt.Errorf("persisting index: %w", err)
	}

	return &meta, nil
}

func (f *Filesystem) GetObject(bucket, key, versionID string) (*ObjectMetadata, io.ReadCloser, error) {
	meta, err := f.HeadObject(bucket, key, versionID)
	if err != nil {
		return nil, nil, err
	}

	if meta.IsDeleteMarker {
		return meta, nil, fmt.Errorf("%w", ErrObjectIsDeleteMarker)
	}

	reader, err := f.readBlob(meta.BlobRef)
	if err != nil {
		return nil, nil, fmt.Errorf("reading object data: %w", err)
	}

	return meta, reader, nil
}

func (f *Filesystem) HeadObject(bucket, key, versionID string) (*ObjectMetadata, error) {
	bs, err := f.getBucketState(bucket)
	if err != nil {
		return nil, err
	}

	bs.mu.RLock()
	defer bs.mu.RUnlock()

	versions, exists := bs.objects[key]
	if !exists || len(versions) == 0 {
		return nil, fmt.Errorf("%w", ErrObjectNotFound)
	}

	if versionID == "" || versionID == "null" {
		// Return latest version
		latest := versions[0]
		if latest.IsDeleteMarker {
			return latest, fmt.Errorf("%w", ErrObjectIsDeleteMarker)
		}
		return latest, nil
	}

	// Find specific version
	for _, v := range versions {
		if v.VersionID == versionID {
			return v, nil
		}
	}

	return nil, fmt.Errorf("%w", ErrVersionNotFound)
}

func (f *Filesystem) DeleteObject(bucket, key, versionID string) (*ObjectMetadata, error) {
	bs, err := f.getBucketState(bucket)
	if err != nil {
		return nil, err
	}

	bs.mu.Lock()
	defer bs.mu.Unlock()

	versions, exists := bs.objects[key]
	if !exists || len(versions) == 0 {
		// S3 returns success even if the key doesn't exist (for non-versioned)
		if bs.meta.Versioning != "Enabled" {
			return nil, nil
		}
		return nil, fmt.Errorf("%w", ErrObjectNotFound)
	}

	if bs.meta.Versioning == "Enabled" && versionID == "" {
		// Add a delete marker
		dm := &ObjectMetadata{
			Key:            key,
			VersionID:      uuid.New().String(),
			IsLatest:       true,
			IsDeleteMarker: true,
			LastModified:   time.Now().UTC(),
		}
		for _, v := range versions {
			v.IsLatest = false
		}
		bs.objects[key] = append([]*ObjectMetadata{dm}, versions...)
		if err := f.persistBucketIndex(bs); err != nil {
			return nil, fmt.Errorf("persisting index: %w", err)
		}
		return dm, nil
	}

	if versionID != "" {
		// Delete specific version
		for i, v := range versions {
			if v.VersionID == versionID {
				result := *v
				bs.objects[key] = append(versions[:i], versions[i+1:]...)
				if len(bs.objects[key]) == 0 {
					delete(bs.objects, key)
				} else if i == 0 && len(bs.objects[key]) > 0 {
					bs.objects[key][0].IsLatest = true
				}
				if err := f.persistBucketIndex(bs); err != nil {
					return nil, fmt.Errorf("persisting index: %w", err)
				}
				return &result, nil
			}
		}
		return nil, fmt.Errorf("%w", ErrVersionNotFound)
	}

	// Non-versioned delete
	deleted := versions[0]
	delete(bs.objects, key)
	if err := f.persistBucketIndex(bs); err != nil {
		return nil, fmt.Errorf("persisting index: %w", err)
	}
	return deleted, nil
}

func (f *Filesystem) ListObjects(bucket string, opts ListObjectsOptions) (*ListObjectsResult, error) {
	bs, err := f.getBucketState(bucket)
	if err != nil {
		return nil, err
	}

	bs.mu.RLock()
	defer bs.mu.RUnlock()

	if opts.MaxKeys <= 0 {
		opts.MaxKeys = 1000
	}

	// Collect all current (latest, non-delete-marker) objects
	var allKeys []string
	for key, versions := range bs.objects {
		if len(versions) > 0 && !versions[0].IsDeleteMarker {
			allKeys = append(allKeys, key)
		}
	}
	sort.Strings(allKeys)

	result := &ListObjectsResult{}
	prefixSet := make(map[string]bool)
	count := 0

	startKey := opts.ContinuationToken
	if startKey == "" {
		startKey = opts.StartAfter
	}

	for _, key := range allKeys {
		if !strings.HasPrefix(key, opts.Prefix) {
			continue
		}
		if startKey != "" && key <= startKey {
			continue
		}

		// Handle delimiter
		if opts.Delimiter != "" {
			rest := key[len(opts.Prefix):]
			idx := strings.Index(rest, opts.Delimiter)
			if idx >= 0 {
				prefix := opts.Prefix + rest[:idx+len(opts.Delimiter)]
				if !prefixSet[prefix] {
					if count >= opts.MaxKeys {
						result.IsTruncated = true
						break
					}
					prefixSet[prefix] = true
					result.CommonPrefixes = append(result.CommonPrefixes, prefix)
					count++
				}
				continue
			}
		}

		if count >= opts.MaxKeys {
			result.IsTruncated = true
			result.NextContinuationToken = key
			break
		}

		versions := bs.objects[key]
		result.Objects = append(result.Objects, *versions[0])
		count++
	}

	return result, nil
}

func (f *Filesystem) ListObjectVersions(bucket string, opts ListVersionsOptions) (*ListVersionsResult, error) {
	bs, err := f.getBucketState(bucket)
	if err != nil {
		return nil, err
	}

	bs.mu.RLock()
	defer bs.mu.RUnlock()

	if opts.MaxKeys <= 0 {
		opts.MaxKeys = 1000
	}

	var allKeys []string
	for key := range bs.objects {
		allKeys = append(allKeys, key)
	}
	sort.Strings(allKeys)

	result := &ListVersionsResult{}
	prefixSet := make(map[string]bool)
	count := 0
	pastMarker := opts.KeyMarker == ""

	for _, key := range allKeys {
		if !strings.HasPrefix(key, opts.Prefix) {
			continue
		}

		if !pastMarker {
			if key < opts.KeyMarker {
				continue
			}
			if key == opts.KeyMarker {
				pastMarker = true
				// Skip versions until past the version ID marker
			} else {
				pastMarker = true
			}
		}

		if opts.Delimiter != "" {
			rest := key[len(opts.Prefix):]
			idx := strings.Index(rest, opts.Delimiter)
			if idx >= 0 {
				prefix := opts.Prefix + rest[:idx+len(opts.Delimiter)]
				if !prefixSet[prefix] {
					if count >= opts.MaxKeys {
						result.IsTruncated = true
						break
					}
					prefixSet[prefix] = true
					result.CommonPrefixes = append(result.CommonPrefixes, prefix)
					count++
				}
				continue
			}
		}

		for _, ver := range bs.objects[key] {
			if count >= opts.MaxKeys {
				result.IsTruncated = true
				result.NextKeyMarker = key
				result.NextVersionIDMarker = ver.VersionID
				break
			}
			result.Versions = append(result.Versions, *ver)
			count++
		}

		if result.IsTruncated {
			break
		}
	}

	return result, nil
}

func (f *Filesystem) CopyObject(srcBucket, srcKey, srcVersionID, dstBucket, dstKey string) (*ObjectMetadata, error) {
	// Read source
	srcMeta, reader, err := f.GetObject(srcBucket, srcKey, srcVersionID)
	if err != nil {
		return nil, fmt.Errorf("reading source object: %w", err)
	}
	defer reader.Close()

	// Write to destination
	newMeta := ObjectMetadata{
		Key:          dstKey,
		ContentType:  srcMeta.ContentType,
		UserMetadata: srcMeta.UserMetadata,
		ACL:          srcMeta.ACL,
	}

	result, err := f.PutObject(dstBucket, newMeta, reader)
	if err != nil {
		return nil, fmt.Errorf("writing destination object: %w", err)
	}

	return result, nil
}

// ── Multipart Upload Operations ─────────────────────────────────────────────

func (f *Filesystem) CreateMultipartUpload(upload MultipartUpload) error {
	bs, err := f.getBucketState(upload.Bucket)
	if err != nil {
		return err
	}

	bs.mu.Lock()
	defer bs.mu.Unlock()

	// Create temp directory for parts
	partsDir := filepath.Join(f.rootDir, "multipart", upload.UploadID)
	if err := os.MkdirAll(partsDir, 0o750); err != nil {
		return fmt.Errorf("creating multipart directory: %w", err)
	}

	bs.uploads[upload.UploadID] = &uploadState{
		info:  upload,
		parts: make(map[int]*PartMetadata),
	}

	return nil
}

func (f *Filesystem) UploadPart(bucket, key, uploadID string, partNum int, data io.Reader) (*PartMetadata, error) {
	bs, err := f.getBucketState(bucket)
	if err != nil {
		return nil, err
	}

	// Write the part data as a blob
	sha, etag, size, err := f.writeBlob(data)
	if err != nil {
		return nil, fmt.Errorf("writing part data: %w", err)
	}

	bs.mu.Lock()
	defer bs.mu.Unlock()

	us, exists := bs.uploads[uploadID]
	if !exists {
		return nil, fmt.Errorf("%w", ErrUploadNotFound)
	}

	part := &PartMetadata{
		PartNumber:   partNum,
		Size:         size,
		ETag:         fmt.Sprintf("%q", etag),
		LastModified: time.Now().UTC(),
		BlobRef:      sha,
	}

	us.parts[partNum] = part
	return part, nil
}

func (f *Filesystem) CompleteMultipartUpload(bucket, key, uploadID string, parts []int) (*ObjectMetadata, error) {
	bs, err := f.getBucketState(bucket)
	if err != nil {
		return nil, err
	}

	bs.mu.Lock()
	us, exists := bs.uploads[uploadID]
	if !exists {
		bs.mu.Unlock()
		return nil, fmt.Errorf("%w", ErrUploadNotFound)
	}

	// Validate all parts exist
	for _, pn := range parts {
		if _, ok := us.parts[pn]; !ok {
			bs.mu.Unlock()
			return nil, fmt.Errorf("part %d not found: %w", pn, ErrPartNotFound)
		}
	}
	bs.mu.Unlock()

	// Concatenate parts into a single blob using a pipe
	pr, pw := io.Pipe()

	go func() {
		defer pw.Close()
		for _, pn := range parts {
			bs.mu.RLock()
			part := us.parts[pn]
			bs.mu.RUnlock()

			reader, err := f.readBlob(part.BlobRef)
			if err != nil {
				pw.CloseWithError(err)
				return
			}
			if _, err := io.Copy(pw, reader); err != nil {
				reader.Close()
				pw.CloseWithError(err)
				return
			}
			reader.Close()
		}
	}()

	// Write concatenated data as new object
	newMeta := ObjectMetadata{
		Key:          key,
		ContentType:  us.info.ContentType,
		UserMetadata: us.info.UserMetadata,
	}

	result, err := f.PutObject(bucket, newMeta, pr)
	if err != nil {
		return nil, fmt.Errorf("writing assembled object: %w", err)
	}

	// Compute multipart ETag (MD5 of concatenated MD5s + "-N")
	md5s := md5.New()
	for _, pn := range parts {
		bs.mu.RLock()
		part := us.parts[pn]
		bs.mu.RUnlock()
		partEtag := strings.Trim(part.ETag, "\"")
		decoded, _ := hex.DecodeString(partEtag)
		md5s.Write(decoded)
	}
	result.ETag = fmt.Sprintf("\"%s-%d\"", hex.EncodeToString(md5s.Sum(nil)), len(parts))

	// Persist the updated ETag
	bs.mu.Lock()
	if vers, ok := bs.objects[key]; ok && len(vers) > 0 {
		vers[0].ETag = result.ETag
		f.persistBucketIndex(bs)
	}

	// Clean up upload state
	delete(bs.uploads, uploadID)
	bs.mu.Unlock()

	// Clean up temp directory
	os.RemoveAll(filepath.Join(f.rootDir, "multipart", uploadID))

	return result, nil
}

func (f *Filesystem) AbortMultipartUpload(bucket, key, uploadID string) error {
	bs, err := f.getBucketState(bucket)
	if err != nil {
		return err
	}

	bs.mu.Lock()
	defer bs.mu.Unlock()

	if _, exists := bs.uploads[uploadID]; !exists {
		return fmt.Errorf("%w", ErrUploadNotFound)
	}

	delete(bs.uploads, uploadID)
	os.RemoveAll(filepath.Join(f.rootDir, "multipart", uploadID))

	return nil
}

func (f *Filesystem) ListMultipartUploads(bucket, prefix, delimiter string, maxUploads int) ([]MultipartUpload, error) {
	bs, err := f.getBucketState(bucket)
	if err != nil {
		return nil, err
	}

	bs.mu.RLock()
	defer bs.mu.RUnlock()

	if maxUploads <= 0 {
		maxUploads = 1000
	}

	var result []MultipartUpload
	for _, us := range bs.uploads {
		if prefix != "" && !strings.HasPrefix(us.info.Key, prefix) {
			continue
		}
		result = append(result, us.info)
		if len(result) >= maxUploads {
			break
		}
	}

	sort.Slice(result, func(i, j int) bool { return result[i].Key < result[j].Key })
	return result, nil
}

func (f *Filesystem) ListParts(bucket, key, uploadID string, maxParts, partMarker int) ([]PartMetadata, bool, error) {
	bs, err := f.getBucketState(bucket)
	if err != nil {
		return nil, false, err
	}

	bs.mu.RLock()
	defer bs.mu.RUnlock()

	us, exists := bs.uploads[uploadID]
	if !exists {
		return nil, false, fmt.Errorf("%w", ErrUploadNotFound)
	}

	if maxParts <= 0 {
		maxParts = 1000
	}

	var parts []PartMetadata
	for _, p := range us.parts {
		parts = append(parts, *p)
	}
	sort.Slice(parts, func(i, j int) bool { return parts[i].PartNumber < parts[j].PartNumber })

	// Apply marker
	var filtered []PartMetadata
	for _, p := range parts {
		if p.PartNumber <= partMarker {
			continue
		}
		filtered = append(filtered, p)
	}

	truncated := len(filtered) > maxParts
	if truncated {
		filtered = filtered[:maxParts]
	}

	return filtered, truncated, nil
}

// ── Lifecycle Support ───────────────────────────────────────────────────────

func (f *Filesystem) GetExpiredObjects(bucket string, rules []LifecycleRule, now time.Time) ([]ObjectMetadata, error) {
	bs, err := f.getBucketState(bucket)
	if err != nil {
		return nil, err
	}

	bs.mu.RLock()
	defer bs.mu.RUnlock()

	var expired []ObjectMetadata

	for _, rule := range rules {
		if rule.Status != "Enabled" {
			continue
		}

		for key, versions := range bs.objects {
			if rule.Prefix != "" && !strings.HasPrefix(key, rule.Prefix) {
				continue
			}

			for _, ver := range versions {
				// Check expiration days
				if rule.ExpirationDays > 0 && ver.IsLatest && !ver.IsDeleteMarker {
					age := now.Sub(ver.LastModified)
					if age >= time.Duration(rule.ExpirationDays)*24*time.Hour {
						expired = append(expired, *ver)
					}
				}

				// Check noncurrent version expiration
				if rule.NoncurrentVersionExpirationDays > 0 && !ver.IsLatest {
					age := now.Sub(ver.LastModified)
					if age >= time.Duration(rule.NoncurrentVersionExpirationDays)*24*time.Hour {
						expired = append(expired, *ver)
					}
				}

				// Check expired delete markers
				if rule.ExpiredObjectDeleteMarker && ver.IsDeleteMarker && ver.IsLatest {
					if len(versions) == 1 {
						expired = append(expired, *ver)
					}
				}
			}
		}
	}

	return expired, nil
}

func (f *Filesystem) GetExpiredMultipartUploads(bucket string, days int, now time.Time) ([]MultipartUpload, error) {
	bs, err := f.getBucketState(bucket)
	if err != nil {
		return nil, err
	}

	bs.mu.RLock()
	defer bs.mu.RUnlock()

	var expired []MultipartUpload
	threshold := time.Duration(days) * 24 * time.Hour

	for _, us := range bs.uploads {
		if now.Sub(us.info.CreatedAt) >= threshold {
			expired = append(expired, us.info)
		}
	}

	return expired, nil
}
