package api

import (
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/warehouse/warehouse/internal/storage"
	"github.com/warehouse/warehouse/pkg/s3types"
)

// handlePutObject handles PUT /<bucket>/<key> — uploads an object.
func (rt *Router) handlePutObject(w http.ResponseWriter, r *http.Request, bucket, key string) {
	reqID := RequestID(r.Context())

	if len(key) > 1024 {
		writeS3Error(w, reqID, s3types.ErrKeyTooLong.WithResource(key))
		return
	}

	contentType := r.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	// Extract user metadata from x-amz-meta-* headers
	userMeta := extractUserMetadata(r)

	// Parse optional ACL
	var acl *storage.ACLConfig
	if cannedACL := r.Header.Get("X-Amz-Acl"); cannedACL != "" {
		accessKey := AccessKey(r.Context())
		acl = cannedACLToGrants(cannedACL, accessKey)
	}

	meta := storage.ObjectMetadata{
		Key:          key,
		ContentType:  contentType,
		UserMetadata: userMeta,
		ACL:          acl,
	}

	result, err := rt.store.PutObject(bucket, meta, r.Body)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(fmt.Sprintf("/%s/%s", bucket, key)))
		return
	}

	w.Header().Set("ETag", result.ETag)
	if result.VersionID != "" && result.VersionID != "null" {
		w.Header().Set("x-amz-version-id", result.VersionID)
	}
	writeSuccess(w, http.StatusOK)
}

// handleGetObject handles GET /<bucket>/<key> — downloads an object.
func (rt *Router) handleGetObject(w http.ResponseWriter, r *http.Request, bucket, key string) {
	reqID := RequestID(r.Context())
	versionID := r.URL.Query().Get("versionId")

	meta, reader, err := rt.store.GetObject(bucket, key, versionID)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(fmt.Sprintf("/%s/%s", bucket, key)))
		return
	}
	defer reader.Close()

	// Handle conditional requests
	if !checkConditionalHeaders(r, meta) {
		writeS3Error(w, reqID, s3types.ErrPreconditionFailed)
		return
	}

	setObjectHeaders(w, meta.ETag, meta.ContentType, meta.VersionID, meta.Size, meta.LastModified, meta.UserMetadata)

	// Handle range requests
	rangeHeader := r.Header.Get("Range")
	if rangeHeader != "" {
		rt.handleRangeRequest(w, r, reader, meta, rangeHeader)
		return
	}

	w.WriteHeader(http.StatusOK)
	io.Copy(w, reader)
}

// handleHeadObject handles HEAD /<bucket>/<key> — gets object metadata.
func (rt *Router) handleHeadObject(w http.ResponseWriter, r *http.Request, bucket, key string) {
	reqID := RequestID(r.Context())
	versionID := r.URL.Query().Get("versionId")

	meta, err := rt.store.HeadObject(bucket, key, versionID)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(fmt.Sprintf("/%s/%s", bucket, key)))
		return
	}

	setObjectHeaders(w, meta.ETag, meta.ContentType, meta.VersionID, meta.Size, meta.LastModified, meta.UserMetadata)

	if meta.IsDeleteMarker {
		w.Header().Set("x-amz-delete-marker", "true")
	}

	writeSuccess(w, http.StatusOK)
}

// handleDeleteObject handles DELETE /<bucket>/<key> — deletes an object.
func (rt *Router) handleDeleteObject(w http.ResponseWriter, r *http.Request, bucket, key string) {
	reqID := RequestID(r.Context())
	versionID := r.URL.Query().Get("versionId")

	result, err := rt.store.DeleteObject(bucket, key, versionID)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(fmt.Sprintf("/%s/%s", bucket, key)))
		return
	}

	if result != nil {
		if result.VersionID != "" && result.VersionID != "null" {
			w.Header().Set("x-amz-version-id", result.VersionID)
		}
		if result.IsDeleteMarker {
			w.Header().Set("x-amz-delete-marker", "true")
		}
	}

	writeSuccess(w, http.StatusNoContent)
}

// handleCopyObject handles PUT /<bucket>/<key> with X-Amz-Copy-Source header.
func (rt *Router) handleCopyObject(w http.ResponseWriter, r *http.Request, dstBucket, dstKey string) {
	reqID := RequestID(r.Context())

	copySource := r.Header.Get("X-Amz-Copy-Source")
	if copySource == "" {
		writeS3Error(w, reqID, s3types.ErrInvalidArgument.WithMessage("Missing copy source"))
		return
	}

	// Parse copy source: /bucket/key or /bucket/key?versionId=xxx
	copySource = strings.TrimPrefix(copySource, "/")
	srcBucket, srcKey := parsePath("/" + copySource)
	if srcBucket == "" || srcKey == "" {
		writeS3Error(w, reqID, s3types.ErrInvalidArgument.WithMessage("Invalid copy source"))
		return
	}

	// Extract version ID from copy source
	srcVersionID := ""
	if idx := strings.Index(srcKey, "?versionId="); idx >= 0 {
		srcVersionID = srcKey[idx+11:]
		srcKey = srcKey[:idx]
	}

	result, err := rt.store.CopyObject(srcBucket, srcKey, srcVersionID, dstBucket, dstKey)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err))
		return
	}

	resp := s3types.CopyObjectResult{
		LastModified: result.LastModified,
		ETag:         result.ETag,
	}

	if result.VersionID != "" && result.VersionID != "null" {
		w.Header().Set("x-amz-version-id", result.VersionID)
	}

	writeXML(w, http.StatusOK, resp)
}

// handleListObjectsV2 handles GET /<bucket>?list-type=2 — lists objects.
func (rt *Router) handleListObjectsV2(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())
	q := r.URL.Query()

	maxKeys := 1000
	if v := q.Get("max-keys"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			maxKeys = n
		}
	}

	opts := storage.ListObjectsOptions{
		Prefix:            q.Get("prefix"),
		Delimiter:         q.Get("delimiter"),
		MaxKeys:           maxKeys,
		ContinuationToken: q.Get("continuation-token"),
		StartAfter:        q.Get("start-after"),
	}

	result, err := rt.store.ListObjects(bucket, opts)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(bucket))
		return
	}

	resp := s3types.ListBucketResult{
		Name:                  bucket,
		Prefix:                opts.Prefix,
		Delimiter:             opts.Delimiter,
		MaxKeys:               maxKeys,
		IsTruncated:           result.IsTruncated,
		KeyCount:              len(result.Objects) + len(result.CommonPrefixes),
		ContinuationToken:     opts.ContinuationToken,
		NextContinuationToken: result.NextContinuationToken,
		StartAfter:            opts.StartAfter,
	}

	for _, obj := range result.Objects {
		resp.Contents = append(resp.Contents, s3types.ObjectInfo{
			Key:          obj.Key,
			LastModified: obj.LastModified,
			ETag:         obj.ETag,
			Size:         obj.Size,
			StorageClass: obj.StorageClass,
		})
	}

	for _, prefix := range result.CommonPrefixes {
		resp.CommonPrefixes = append(resp.CommonPrefixes, s3types.CommonPrefix{Prefix: prefix})
	}

	writeXML(w, http.StatusOK, resp)
}

// handleListObjectVersions handles GET /<bucket>?versions — lists object versions.
func (rt *Router) handleListObjectVersions(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())
	q := r.URL.Query()

	maxKeys := 1000
	if v := q.Get("max-keys"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			maxKeys = n
		}
	}

	opts := storage.ListVersionsOptions{
		Prefix:          q.Get("prefix"),
		Delimiter:       q.Get("delimiter"),
		MaxKeys:         maxKeys,
		KeyMarker:       q.Get("key-marker"),
		VersionIDMarker: q.Get("version-id-marker"),
	}

	result, err := rt.store.ListObjectVersions(bucket, opts)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(bucket))
		return
	}

	resp := s3types.ListVersionsResult{
		Name:                bucket,
		Prefix:              opts.Prefix,
		Delimiter:           opts.Delimiter,
		MaxKeys:             maxKeys,
		IsTruncated:         result.IsTruncated,
		KeyMarker:           opts.KeyMarker,
		VersionIdMarker:     opts.VersionIDMarker,
		NextKeyMarker:       result.NextKeyMarker,
		NextVersionIdMarker: result.NextVersionIDMarker,
	}

	for _, ver := range result.Versions {
		if ver.IsDeleteMarker {
			resp.DeleteMarkers = append(resp.DeleteMarkers, s3types.DeleteMarkerEntry{
				Key:          ver.Key,
				VersionId:    ver.VersionID,
				IsLatest:     ver.IsLatest,
				LastModified: ver.LastModified,
			})
		} else {
			resp.Versions = append(resp.Versions, s3types.ObjectVersion{
				Key:          ver.Key,
				VersionId:    ver.VersionID,
				IsLatest:     ver.IsLatest,
				LastModified: ver.LastModified,
				ETag:         ver.ETag,
				Size:         ver.Size,
				StorageClass: ver.StorageClass,
			})
		}
	}

	for _, prefix := range result.CommonPrefixes {
		resp.CommonPrefixes = append(resp.CommonPrefixes, s3types.CommonPrefix{Prefix: prefix})
	}

	writeXML(w, http.StatusOK, resp)
}

// handleDeleteMultipleObjects handles POST /<bucket>?delete — multi-object delete.
func (rt *Router) handleDeleteMultipleObjects(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())

	body, err := io.ReadAll(io.LimitReader(r.Body, 10*1024*1024))
	if err != nil {
		writeS3Error(w, reqID, s3types.ErrIncompleteBody)
		return
	}

	var deleteReq s3types.DeleteRequest
	if err := xml.Unmarshal(body, &deleteReq); err != nil {
		writeS3Error(w, reqID, s3types.ErrMalformedXML)
		return
	}

	result := s3types.DeleteResult{}

	for _, obj := range deleteReq.Objects {
		deleted, err := rt.store.DeleteObject(bucket, obj.Key, obj.VersionId)
		if err != nil {
			s3err := mapStorageError(err)
			result.Errors = append(result.Errors, s3types.DeleteError{
				Key:     obj.Key,
				Code:    s3err.Code,
				Message: s3err.Message,
			})
			continue
		}

		if !deleteReq.Quiet {
			d := s3types.DeletedObject{Key: obj.Key}
			if deleted != nil {
				d.VersionId = deleted.VersionID
				d.DeleteMarker = deleted.IsDeleteMarker
				if deleted.IsDeleteMarker {
					d.DeleteMarkerVersionId = deleted.VersionID
				}
			}
			result.Deleted = append(result.Deleted, d)
		}
	}

	writeXML(w, http.StatusOK, result)
}

// ── Object ACL Handlers ─────────────────────────────────────────────────────

// handleGetObjectACL handles GET /<bucket>/<key>?acl.
func (rt *Router) handleGetObjectACL(w http.ResponseWriter, r *http.Request, bucket, key string) {
	reqID := RequestID(r.Context())

	meta, err := rt.store.HeadObject(bucket, key, "")
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(fmt.Sprintf("/%s/%s", bucket, key)))
		return
	}

	result := s3types.AccessControlPolicy{
		Owner: s3types.Owner{
			ID:          AccessKey(r.Context()),
			DisplayName: AccessKey(r.Context()),
		},
	}

	if meta.ACL != nil {
		for _, g := range meta.ACL.Grants {
			result.AccessControlList = append(result.AccessControlList, s3types.Grant{
				Grantee: s3types.Grantee{
					XSI:  "http://www.w3.org/2001/XMLSchema-instance",
					Type: g.GranteeType,
					ID:   g.GranteeID,
					URI:  g.GranteeURI,
				},
				Permission: g.Permission,
			})
		}
	} else {
		// Default: owner has full control
		result.AccessControlList = append(result.AccessControlList, s3types.Grant{
			Grantee: s3types.Grantee{
				XSI:  "http://www.w3.org/2001/XMLSchema-instance",
				Type: "CanonicalUser",
				ID:   AccessKey(r.Context()),
			},
			Permission: "FULL_CONTROL",
		})
	}

	writeXML(w, http.StatusOK, result)
}

// handlePutObjectACL handles PUT /<bucket>/<key>?acl.
func (rt *Router) handlePutObjectACL(w http.ResponseWriter, r *http.Request, bucket, key string) {
	reqID := RequestID(r.Context())

	// For now, we acknowledge the request but ACLs on objects are stored
	// in the object metadata. A full implementation would update the
	// object's ACL in the index.
	_ = reqID
	writeSuccess(w, http.StatusOK)
}

// ── Helpers ─────────────────────────────────────────────────────────────────

// extractUserMetadata extracts x-amz-meta-* headers into a map.
func extractUserMetadata(r *http.Request) map[string]string {
	meta := make(map[string]string)
	for key, values := range r.Header {
		lower := strings.ToLower(key)
		if strings.HasPrefix(lower, "x-amz-meta-") {
			metaKey := strings.TrimPrefix(lower, "x-amz-meta-")
			if len(values) > 0 {
				meta[metaKey] = values[0]
			}
		}
	}
	return meta
}

// checkConditionalHeaders evaluates If-Match, If-None-Match, etc.
func checkConditionalHeaders(r *http.Request, meta *storage.ObjectMetadata) bool {
	// If-Match
	if ifMatch := r.Header.Get("If-Match"); ifMatch != "" {
		if ifMatch != "*" && ifMatch != meta.ETag {
			return false
		}
	}

	// If-None-Match
	if ifNoneMatch := r.Header.Get("If-None-Match"); ifNoneMatch != "" {
		if ifNoneMatch == meta.ETag {
			return false
		}
	}

	// If-Modified-Since
	if ifModSince := r.Header.Get("If-Modified-Since"); ifModSince != "" {
		t, err := time.Parse(http.TimeFormat, ifModSince)
		if err == nil && !meta.LastModified.After(t) {
			return false
		}
	}

	// If-Unmodified-Since
	if ifUnmodSince := r.Header.Get("If-Unmodified-Since"); ifUnmodSince != "" {
		t, err := time.Parse(http.TimeFormat, ifUnmodSince)
		if err == nil && meta.LastModified.After(t) {
			return false
		}
	}

	return true
}

// handleRangeRequest handles HTTP Range requests for partial content.
func (rt *Router) handleRangeRequest(w http.ResponseWriter, r *http.Request, reader io.ReadCloser, meta *storage.ObjectMetadata, rangeHeader string) {
	reqID := RequestID(r.Context())

	// Parse Range header: bytes=start-end
	if !strings.HasPrefix(rangeHeader, "bytes=") {
		writeS3Error(w, reqID, s3types.ErrInvalidRange)
		return
	}

	rangeSpec := strings.TrimPrefix(rangeHeader, "bytes=")
	parts := strings.SplitN(rangeSpec, "-", 2)
	if len(parts) != 2 {
		writeS3Error(w, reqID, s3types.ErrInvalidRange)
		return
	}

	var start, end int64
	totalSize := meta.Size

	if parts[0] == "" {
		// Suffix range: -N (last N bytes)
		n, err := strconv.ParseInt(parts[1], 10, 64)
		if err != nil || n <= 0 {
			writeS3Error(w, reqID, s3types.ErrInvalidRange)
			return
		}
		start = totalSize - n
		end = totalSize - 1
	} else if parts[1] == "" {
		// Open-ended range: N-
		n, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil || n < 0 {
			writeS3Error(w, reqID, s3types.ErrInvalidRange)
			return
		}
		start = n
		end = totalSize - 1
	} else {
		// Explicit range: N-M
		var err error
		start, err = strconv.ParseInt(parts[0], 10, 64)
		if err != nil || start < 0 {
			writeS3Error(w, reqID, s3types.ErrInvalidRange)
			return
		}
		end, err = strconv.ParseInt(parts[1], 10, 64)
		if err != nil || end < start {
			writeS3Error(w, reqID, s3types.ErrInvalidRange)
			return
		}
	}

	if start < 0 {
		start = 0
	}
	if end >= totalSize {
		end = totalSize - 1
	}
	if start > end || start >= totalSize {
		writeS3Error(w, reqID, s3types.ErrInvalidRange)
		return
	}

	contentLen := end - start + 1

	// Skip to start position
	if start > 0 {
		if _, err := io.CopyN(io.Discard, reader, start); err != nil {
			writeS3Error(w, reqID, s3types.ErrInternalError)
			return
		}
	}

	w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, totalSize))
	w.Header().Set("Content-Length", strconv.FormatInt(contentLen, 10))
	w.Header().Set("Accept-Ranges", "bytes")
	w.WriteHeader(http.StatusPartialContent)

	io.CopyN(w, reader, contentLen)
}
