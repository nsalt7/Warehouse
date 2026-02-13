// Package s3types defines the XML request/response structures for S3 API compatibility.
package s3types

import (
	"encoding/xml"
	"time"
)

// ── Owner & Common ──────────────────────────────────────────────────────────

// Owner represents an S3 bucket or object owner.
type Owner struct {
	XMLName     xml.Name `xml:"Owner" json:"-"`
	ID          string   `xml:"ID" json:"id"`
	DisplayName string   `xml:"DisplayName" json:"display_name"`
}

// CommonPrefix is used in list responses for delimiter-based grouping.
type CommonPrefix struct {
	Prefix string `xml:"Prefix"`
}

// ── Bucket Types ────────────────────────────────────────────────────────────

// BucketInfo is the metadata for a single bucket.
type BucketInfo struct {
	Name         string    `xml:"Name" json:"name"`
	CreationDate time.Time `xml:"CreationDate" json:"creation_date"`
}

// ListAllMyBucketsResult is the response for GET / (ListBuckets).
type ListAllMyBucketsResult struct {
	XMLName xml.Name     `xml:"ListAllMyBucketsResult"`
	Owner   Owner        `xml:"Owner"`
	Buckets []BucketInfo `xml:"Buckets>Bucket"`
}

// CreateBucketConfiguration is the request body for PUT /<bucket>.
type CreateBucketConfiguration struct {
	XMLName            xml.Name `xml:"CreateBucketConfiguration"`
	LocationConstraint string   `xml:"LocationConstraint,omitempty"`
}

// LocationConstraint is the response for GET /<bucket>?location.
type LocationConstraint struct {
	XMLName  xml.Name `xml:"LocationConstraint"`
	Location string   `xml:",chardata"`
}

// ── Object / List Types ─────────────────────────────────────────────────────

// ObjectInfo represents a single object in a list response.
type ObjectInfo struct {
	Key          string    `xml:"Key"`
	LastModified time.Time `xml:"LastModified"`
	ETag         string    `xml:"ETag"`
	Size         int64     `xml:"Size"`
	StorageClass string    `xml:"StorageClass"`
	Owner        *Owner    `xml:"Owner,omitempty"`
}

// ListBucketResult is the response for GET /<bucket> (ListObjectsV2).
type ListBucketResult struct {
	XMLName               xml.Name       `xml:"ListBucketResult"`
	Name                  string         `xml:"Name"`
	Prefix                string         `xml:"Prefix"`
	Delimiter             string         `xml:"Delimiter,omitempty"`
	MaxKeys               int            `xml:"MaxKeys"`
	IsTruncated           bool           `xml:"IsTruncated"`
	KeyCount              int            `xml:"KeyCount"`
	ContinuationToken     string         `xml:"ContinuationToken,omitempty"`
	NextContinuationToken string         `xml:"NextContinuationToken,omitempty"`
	StartAfter            string         `xml:"StartAfter,omitempty"`
	Contents              []ObjectInfo   `xml:"Contents"`
	CommonPrefixes        []CommonPrefix `xml:"CommonPrefixes,omitempty"`
}

// ── Versioning Types ────────────────────────────────────────────────────────

// VersioningConfiguration is both the request and response for bucket versioning.
type VersioningConfiguration struct {
	XMLName xml.Name `xml:"VersioningConfiguration"`
	Status  string   `xml:"Status,omitempty"` // "Enabled" or "Suspended"
}

// ObjectVersion represents a versioned object in a list versions response.
type ObjectVersion struct {
	XMLName      xml.Name  `xml:"Version"`
	Key          string    `xml:"Key"`
	VersionId    string    `xml:"VersionId"`
	IsLatest     bool      `xml:"IsLatest"`
	LastModified time.Time `xml:"LastModified"`
	ETag         string    `xml:"ETag"`
	Size         int64     `xml:"Size"`
	StorageClass string    `xml:"StorageClass"`
	Owner        *Owner    `xml:"Owner,omitempty"`
}

// DeleteMarkerEntry represents a delete marker in a list versions response.
type DeleteMarkerEntry struct {
	XMLName      xml.Name  `xml:"DeleteMarker"`
	Key          string    `xml:"Key"`
	VersionId    string    `xml:"VersionId"`
	IsLatest     bool      `xml:"IsLatest"`
	LastModified time.Time `xml:"LastModified"`
	Owner        *Owner    `xml:"Owner,omitempty"`
}

// ListVersionsResult is the response for GET /<bucket>?versions.
type ListVersionsResult struct {
	XMLName             xml.Name            `xml:"ListVersionsResult"`
	Name                string              `xml:"Name"`
	Prefix              string              `xml:"Prefix"`
	Delimiter           string              `xml:"Delimiter,omitempty"`
	MaxKeys             int                 `xml:"MaxKeys"`
	IsTruncated         bool                `xml:"IsTruncated"`
	KeyMarker           string              `xml:"KeyMarker"`
	VersionIdMarker     string              `xml:"VersionIdMarker"`
	NextKeyMarker       string              `xml:"NextKeyMarker,omitempty"`
	NextVersionIdMarker string              `xml:"NextVersionIdMarker,omitempty"`
	Versions            []ObjectVersion     `xml:"Version"`
	DeleteMarkers       []DeleteMarkerEntry `xml:"DeleteMarker"`
	CommonPrefixes      []CommonPrefix      `xml:"CommonPrefixes,omitempty"`
}

// ── Multipart Upload Types ──────────────────────────────────────────────────

// InitiateMultipartUploadResult is the response for POST /<bucket>/<key>?uploads.
type InitiateMultipartUploadResult struct {
	XMLName  xml.Name `xml:"InitiateMultipartUploadResult"`
	Bucket   string   `xml:"Bucket"`
	Key      string   `xml:"Key"`
	UploadId string   `xml:"UploadId"`
}

// CompletedPart represents a single part in a CompleteMultipartUpload request.
type CompletedPart struct {
	PartNumber int    `xml:"PartNumber"`
	ETag       string `xml:"ETag"`
}

// CompleteMultipartUpload is the request body for completing a multipart upload.
type CompleteMultipartUpload struct {
	XMLName xml.Name        `xml:"CompleteMultipartUpload"`
	Parts   []CompletedPart `xml:"Part"`
}

// CompleteMultipartUploadResult is the response for completing a multipart upload.
type CompleteMultipartUploadResult struct {
	XMLName  xml.Name `xml:"CompleteMultipartUploadResult"`
	Location string   `xml:"Location"`
	Bucket   string   `xml:"Bucket"`
	Key      string   `xml:"Key"`
	ETag     string   `xml:"ETag"`
}

// PartInfo describes an uploaded part.
type PartInfo struct {
	PartNumber   int       `xml:"PartNumber"`
	LastModified time.Time `xml:"LastModified"`
	ETag         string    `xml:"ETag"`
	Size         int64     `xml:"Size"`
}

// ListPartsResult is the response for GET /<bucket>/<key>?uploadId=.
type ListPartsResult struct {
	XMLName              xml.Name   `xml:"ListPartsResult"`
	Bucket               string     `xml:"Bucket"`
	Key                  string     `xml:"Key"`
	UploadId             string     `xml:"UploadId"`
	Initiator            Owner      `xml:"Initiator"`
	Owner                Owner      `xml:"Owner"`
	StorageClass         string     `xml:"StorageClass"`
	PartNumberMarker     int        `xml:"PartNumberMarker"`
	NextPartNumberMarker int        `xml:"NextPartNumberMarker"`
	MaxParts             int        `xml:"MaxParts"`
	IsTruncated          bool       `xml:"IsTruncated"`
	Parts                []PartInfo `xml:"Part"`
}

// MultipartUploadInfo describes an in-progress multipart upload.
type MultipartUploadInfo struct {
	Key          string    `xml:"Key"`
	UploadId     string    `xml:"UploadId"`
	Initiator    Owner     `xml:"Initiator"`
	Owner        Owner     `xml:"Owner"`
	StorageClass string    `xml:"StorageClass"`
	Initiated    time.Time `xml:"Initiated"`
}

// ListMultipartUploadsResult is the response for GET /<bucket>?uploads.
type ListMultipartUploadsResult struct {
	XMLName            xml.Name              `xml:"ListMultipartUploadsResult"`
	Bucket             string                `xml:"Bucket"`
	KeyMarker          string                `xml:"KeyMarker"`
	UploadIdMarker     string                `xml:"UploadIdMarker"`
	NextKeyMarker      string                `xml:"NextKeyMarker,omitempty"`
	NextUploadIdMarker string                `xml:"NextUploadIdMarker,omitempty"`
	Delimiter          string                `xml:"Delimiter,omitempty"`
	Prefix             string                `xml:"Prefix"`
	MaxUploads         int                   `xml:"MaxUploads"`
	IsTruncated        bool                  `xml:"IsTruncated"`
	Uploads            []MultipartUploadInfo `xml:"Upload"`
	CommonPrefixes     []CommonPrefix        `xml:"CommonPrefixes,omitempty"`
}

// ── ACL Types ───────────────────────────────────────────────────────────────

// Grantee represents an ACL grantee.
type Grantee struct {
	XMLName     xml.Name `xml:"Grantee"`
	XSI         string   `xml:"xmlns:xsi,attr,omitempty"`
	Type        string   `xml:"xsi:type,attr"`
	ID          string   `xml:"ID,omitempty"`
	DisplayName string   `xml:"DisplayName,omitempty"`
	URI         string   `xml:"URI,omitempty"`
}

// Grant represents an individual ACL grant.
type Grant struct {
	Grantee    Grantee `xml:"Grantee"`
	Permission string  `xml:"Permission"` // FULL_CONTROL, WRITE, WRITE_ACP, READ, READ_ACP
}

// AccessControlPolicy is the ACL document.
type AccessControlPolicy struct {
	XMLName           xml.Name `xml:"AccessControlPolicy"`
	Owner             Owner    `xml:"Owner"`
	AccessControlList []Grant  `xml:"AccessControlList>Grant"`
}

// ── Bucket Policy Types ─────────────────────────────────────────────────────

// PolicyStatement represents a single statement in a bucket policy.
type PolicyStatement struct {
	Sid       string      `json:"Sid,omitempty"`
	Effect    string      `json:"Effect"` // "Allow" or "Deny"
	Principal interface{} `json:"Principal"`
	Action    interface{} `json:"Action"`
	Resource  interface{} `json:"Resource"`
	Condition interface{} `json:"Condition,omitempty"`
}

// BucketPolicy represents an S3 bucket policy document.
type BucketPolicy struct {
	Version   string            `json:"Version"`
	Id        string            `json:"Id,omitempty"`
	Statement []PolicyStatement `json:"Statement"`
}

// ── Lifecycle Types ─────────────────────────────────────────────────────────

// LifecycleExpiration defines when objects expire.
type LifecycleExpiration struct {
	Days                      int    `xml:"Days,omitempty" json:"days,omitempty"`
	Date                      string `xml:"Date,omitempty" json:"date,omitempty"`
	ExpiredObjectDeleteMarker bool   `xml:"ExpiredObjectDeleteMarker,omitempty" json:"expired_object_delete_marker,omitempty"`
}

// LifecycleFilter defines which objects a rule applies to.
type LifecycleFilter struct {
	Prefix string `xml:"Prefix,omitempty" json:"prefix,omitempty"`
}

// NoncurrentVersionExpiration defines expiration for non-current versions.
type NoncurrentVersionExpiration struct {
	NoncurrentDays int `xml:"NoncurrentDays,omitempty" json:"noncurrent_days,omitempty"`
}

// AbortIncompleteMultipartUpload defines cleanup of incomplete multipart uploads.
type AbortIncompleteMultipartUpload struct {
	DaysAfterInitiation int `xml:"DaysAfterInitiation,omitempty" json:"days_after_initiation,omitempty"`
}

// LifecycleRule defines a single lifecycle rule.
type LifecycleRule struct {
	ID                             string                          `xml:"ID" json:"id"`
	Status                         string                          `xml:"Status" json:"status"` // "Enabled" or "Disabled"
	Filter                         LifecycleFilter                 `xml:"Filter" json:"filter"`
	Expiration                     *LifecycleExpiration            `xml:"Expiration,omitempty" json:"expiration,omitempty"`
	NoncurrentVersionExpiration    *NoncurrentVersionExpiration    `xml:"NoncurrentVersionExpiration,omitempty" json:"noncurrent_version_expiration,omitempty"`
	AbortIncompleteMultipartUpload *AbortIncompleteMultipartUpload `xml:"AbortIncompleteMultipartUpload,omitempty" json:"abort_incomplete_multipart_upload,omitempty"`
}

// LifecycleConfiguration is the bucket lifecycle configuration.
type LifecycleConfiguration struct {
	XMLName xml.Name        `xml:"LifecycleConfiguration"`
	Rules   []LifecycleRule `xml:"Rule" json:"rules"`
}

// ── Copy Types ──────────────────────────────────────────────────────────────

// CopyObjectResult is the response for a successful CopyObject.
type CopyObjectResult struct {
	XMLName      xml.Name  `xml:"CopyObjectResult"`
	LastModified time.Time `xml:"LastModified"`
	ETag         string    `xml:"ETag"`
}

// ── Delete Types ────────────────────────────────────────────────────────────

// ObjectIdentifier is a single object to delete in a multi-delete request.
type ObjectIdentifier struct {
	Key       string `xml:"Key"`
	VersionId string `xml:"VersionId,omitempty"`
}

// DeleteRequest is the request body for multi-object delete.
type DeleteRequest struct {
	XMLName xml.Name           `xml:"Delete"`
	Quiet   bool               `xml:"Quiet"`
	Objects []ObjectIdentifier `xml:"Object"`
}

// DeletedObject is a successfully deleted object.
type DeletedObject struct {
	Key                   string `xml:"Key"`
	VersionId             string `xml:"VersionId,omitempty"`
	DeleteMarker          bool   `xml:"DeleteMarker,omitempty"`
	DeleteMarkerVersionId string `xml:"DeleteMarkerVersionId,omitempty"`
}

// DeleteError is a failed delete operation.
type DeleteError struct {
	Key       string `xml:"Key"`
	Code      string `xml:"Code"`
	Message   string `xml:"Message"`
	VersionId string `xml:"VersionId,omitempty"`
}

// DeleteResult is the response for multi-object delete.
type DeleteResult struct {
	XMLName xml.Name        `xml:"DeleteResult"`
	Deleted []DeletedObject `xml:"Deleted,omitempty"`
	Errors  []DeleteError   `xml:"Error,omitempty"`
}
