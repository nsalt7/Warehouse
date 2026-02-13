// Package storage defines the storage interface and types for the Warehouse S3 server.
package storage

import (
	"io"
	"time"
)

// ── Metadata Types ──────────────────────────────────────────────────────────

// BucketMetadata holds all metadata for a bucket.
type BucketMetadata struct {
	Name         string            `json:"name"`
	CreatedAt    time.Time         `json:"created_at"`
	Owner        string            `json:"owner"`
	Region       string            `json:"region"`
	Versioning   string            `json:"versioning"` // "", "Enabled", "Suspended"
	ACL          *ACLConfig        `json:"acl,omitempty"`
	Policy       []byte            `json:"policy,omitempty"` // raw JSON
	Lifecycle    *LifecycleConfig  `json:"lifecycle,omitempty"`
}

// ACLConfig stores ACL grants.
type ACLConfig struct {
	Grants []ACLGrant `json:"grants"`
}

// ACLGrant represents a single ACL grant.
type ACLGrant struct {
	GranteeType string `json:"grantee_type"` // "CanonicalUser", "Group"
	GranteeID   string `json:"grantee_id"`
	GranteeName string `json:"grantee_name,omitempty"`
	GranteeURI  string `json:"grantee_uri,omitempty"`
	Permission  string `json:"permission"` // FULL_CONTROL, READ, WRITE, READ_ACP, WRITE_ACP
}

// LifecycleConfig holds lifecycle rules.
type LifecycleConfig struct {
	Rules []LifecycleRule `json:"rules"`
}

// LifecycleRule is a single lifecycle rule.
type LifecycleRule struct {
	ID                             string                          `json:"id"`
	Status                         string                          `json:"status"` // "Enabled", "Disabled"
	Prefix                         string                          `json:"prefix"`
	ExpirationDays                 int                             `json:"expiration_days,omitempty"`
	ExpirationDate                 string                          `json:"expiration_date,omitempty"`
	ExpiredObjectDeleteMarker      bool                            `json:"expired_delete_marker,omitempty"`
	NoncurrentVersionExpirationDays int                            `json:"noncurrent_days,omitempty"`
	AbortMultipartDays             int                             `json:"abort_multipart_days,omitempty"`
}

// ObjectMetadata holds metadata for a single object version.
type ObjectMetadata struct {
	Key          string            `json:"key"`
	VersionID    string            `json:"version_id"`
	IsLatest     bool              `json:"is_latest"`
	IsDeleteMarker bool           `json:"is_delete_marker"`
	Size         int64             `json:"size"`
	ETag         string            `json:"etag"`
	ContentType  string            `json:"content_type"`
	LastModified time.Time         `json:"last_modified"`
	StorageClass string            `json:"storage_class"`
	UserMetadata map[string]string `json:"user_metadata,omitempty"`
	BlobRef      string            `json:"blob_ref"` // content-addressable hash
	ACL          *ACLConfig        `json:"acl,omitempty"`
}

// MultipartUpload tracks an in-progress multipart upload.
type MultipartUpload struct {
	UploadID     string            `json:"upload_id"`
	Bucket       string            `json:"bucket"`
	Key          string            `json:"key"`
	Initiator    string            `json:"initiator"`
	ContentType  string            `json:"content_type"`
	UserMetadata map[string]string `json:"user_metadata,omitempty"`
	CreatedAt    time.Time         `json:"created_at"`
}

// PartMetadata tracks a single uploaded part.
type PartMetadata struct {
	PartNumber   int       `json:"part_number"`
	Size         int64     `json:"size"`
	ETag         string    `json:"etag"`
	LastModified time.Time `json:"last_modified"`
	BlobRef      string    `json:"blob_ref"`
}

// ListObjectsOptions configures a list operation.
type ListObjectsOptions struct {
	Prefix            string
	Delimiter         string
	MaxKeys           int
	ContinuationToken string
	StartAfter        string
}

// ListObjectsResult is the result of a list operation.
type ListObjectsResult struct {
	Objects               []ObjectMetadata
	CommonPrefixes        []string
	IsTruncated           bool
	NextContinuationToken string
}

// ListVersionsOptions configures a list versions operation.
type ListVersionsOptions struct {
	Prefix          string
	Delimiter       string
	MaxKeys         int
	KeyMarker       string
	VersionIDMarker string
}

// ListVersionsResult is the result of a list versions operation.
type ListVersionsResult struct {
	Versions            []ObjectMetadata
	CommonPrefixes      []string
	IsTruncated         bool
	NextKeyMarker       string
	NextVersionIDMarker string
}

// ── Storage Backend Interface ───────────────────────────────────────────────

// Backend defines the storage interface that all implementations must satisfy.
type Backend interface {
	// Bucket operations
	CreateBucket(name string, meta BucketMetadata) error
	GetBucket(name string) (*BucketMetadata, error)
	DeleteBucket(name string) error
	ListBuckets() ([]BucketMetadata, error)
	UpdateBucket(name string, meta BucketMetadata) error

	// Object operations
	PutObject(bucket string, meta ObjectMetadata, data io.Reader) (*ObjectMetadata, error)
	GetObject(bucket, key, versionID string) (*ObjectMetadata, io.ReadCloser, error)
	HeadObject(bucket, key, versionID string) (*ObjectMetadata, error)
	DeleteObject(bucket, key, versionID string) (*ObjectMetadata, error)
	ListObjects(bucket string, opts ListObjectsOptions) (*ListObjectsResult, error)
	ListObjectVersions(bucket string, opts ListVersionsOptions) (*ListVersionsResult, error)
	CopyObject(srcBucket, srcKey, srcVersionID, dstBucket, dstKey string) (*ObjectMetadata, error)

	// Multipart upload operations
	CreateMultipartUpload(upload MultipartUpload) error
	UploadPart(bucket, key, uploadID string, partNum int, data io.Reader) (*PartMetadata, error)
	CompleteMultipartUpload(bucket, key, uploadID string, parts []int) (*ObjectMetadata, error)
	AbortMultipartUpload(bucket, key, uploadID string) error
	ListMultipartUploads(bucket, prefix, delimiter string, maxUploads int) ([]MultipartUpload, error)
	ListParts(bucket, key, uploadID string, maxParts, partMarker int) ([]PartMetadata, bool, error)

	// Lifecycle support
	GetExpiredObjects(bucket string, rules []LifecycleRule, now time.Time) ([]ObjectMetadata, error)
	GetExpiredMultipartUploads(bucket string, days int, now time.Time) ([]MultipartUpload, error)
}
