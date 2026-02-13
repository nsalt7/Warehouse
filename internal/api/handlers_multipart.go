package api

import (
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/warehouse/warehouse/internal/storage"
	"github.com/warehouse/warehouse/pkg/s3types"
)

// handleInitiateMultipartUpload handles POST /<bucket>/<key>?uploads.
func (rt *Router) handleInitiateMultipartUpload(w http.ResponseWriter, r *http.Request, bucket, key string) {
	reqID := RequestID(r.Context())

	// Verify bucket exists
	if _, err := rt.store.GetBucket(bucket); err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(bucket))
		return
	}

	contentType := r.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	uploadID := uuid.New().String()
	upload := storage.MultipartUpload{
		UploadID:     uploadID,
		Bucket:       bucket,
		Key:          key,
		Initiator:    AccessKey(r.Context()),
		ContentType:  contentType,
		UserMetadata: extractUserMetadata(r),
		CreatedAt:    time.Now().UTC(),
	}

	if err := rt.store.CreateMultipartUpload(upload); err != nil {
		writeS3Error(w, reqID, mapStorageError(err))
		return
	}

	result := s3types.InitiateMultipartUploadResult{
		Bucket:   bucket,
		Key:      key,
		UploadId: uploadID,
	}

	writeXML(w, http.StatusOK, result)
}

// handleUploadPart handles PUT /<bucket>/<key>?partNumber=N&uploadId=X.
func (rt *Router) handleUploadPart(w http.ResponseWriter, r *http.Request, bucket, key string) {
	reqID := RequestID(r.Context())
	q := r.URL.Query()

	partNumber, err := strconv.Atoi(q.Get("partNumber"))
	if err != nil || partNumber < 1 || partNumber > 10000 {
		writeS3Error(w, reqID, s3types.ErrInvalidArgument.WithMessage("Invalid part number"))
		return
	}

	uploadID := q.Get("uploadId")
	if uploadID == "" {
		writeS3Error(w, reqID, s3types.ErrInvalidArgument.WithMessage("Missing uploadId"))
		return
	}

	part, err := rt.store.UploadPart(bucket, key, uploadID, partNumber, r.Body)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err))
		return
	}

	w.Header().Set("ETag", part.ETag)
	writeSuccess(w, http.StatusOK)
}

// handleCompleteMultipartUpload handles POST /<bucket>/<key>?uploadId=X.
func (rt *Router) handleCompleteMultipartUpload(w http.ResponseWriter, r *http.Request, bucket, key string) {
	reqID := RequestID(r.Context())
	uploadID := r.URL.Query().Get("uploadId")

	if uploadID == "" {
		writeS3Error(w, reqID, s3types.ErrInvalidArgument.WithMessage("Missing uploadId"))
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 10*1024*1024))
	if err != nil {
		writeS3Error(w, reqID, s3types.ErrIncompleteBody)
		return
	}

	var completeReq s3types.CompleteMultipartUpload
	if err := xml.Unmarshal(body, &completeReq); err != nil {
		writeS3Error(w, reqID, s3types.ErrMalformedXML)
		return
	}

	if len(completeReq.Parts) == 0 {
		writeS3Error(w, reqID, s3types.ErrInvalidArgument.WithMessage("No parts specified"))
		return
	}

	// Validate part order is ascending
	for i := 1; i < len(completeReq.Parts); i++ {
		if completeReq.Parts[i].PartNumber <= completeReq.Parts[i-1].PartNumber {
			writeS3Error(w, reqID, s3types.ErrInvalidPartOrder)
			return
		}
	}

	// Extract part numbers
	partNums := make([]int, len(completeReq.Parts))
	for i, p := range completeReq.Parts {
		partNums[i] = p.PartNumber
	}

	result, err := rt.store.CompleteMultipartUpload(bucket, key, uploadID, partNums)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err))
		return
	}

	resp := s3types.CompleteMultipartUploadResult{
		Location: fmt.Sprintf("/%s/%s", bucket, key),
		Bucket:   bucket,
		Key:      key,
		ETag:     result.ETag,
	}

	writeXML(w, http.StatusOK, resp)
}

// handleAbortMultipartUpload handles DELETE /<bucket>/<key>?uploadId=X.
func (rt *Router) handleAbortMultipartUpload(w http.ResponseWriter, r *http.Request, bucket, key string) {
	reqID := RequestID(r.Context())
	uploadID := r.URL.Query().Get("uploadId")

	if uploadID == "" {
		writeS3Error(w, reqID, s3types.ErrInvalidArgument.WithMessage("Missing uploadId"))
		return
	}

	if err := rt.store.AbortMultipartUpload(bucket, key, uploadID); err != nil {
		writeS3Error(w, reqID, mapStorageError(err))
		return
	}

	writeSuccess(w, http.StatusNoContent)
}

// handleListMultipartUploads handles GET /<bucket>?uploads.
func (rt *Router) handleListMultipartUploads(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())
	q := r.URL.Query()

	maxUploads := 1000
	if v := q.Get("max-uploads"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxUploads = n
		}
	}

	uploads, err := rt.store.ListMultipartUploads(
		bucket,
		q.Get("prefix"),
		q.Get("delimiter"),
		maxUploads,
	)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(bucket))
		return
	}

	resp := s3types.ListMultipartUploadsResult{
		Bucket:     bucket,
		Prefix:     q.Get("prefix"),
		Delimiter:  q.Get("delimiter"),
		MaxUploads: maxUploads,
	}

	for _, u := range uploads {
		resp.Uploads = append(resp.Uploads, s3types.MultipartUploadInfo{
			Key:      u.Key,
			UploadId: u.UploadID,
			Initiator: s3types.Owner{
				ID:          u.Initiator,
				DisplayName: u.Initiator,
			},
			Owner: s3types.Owner{
				ID:          u.Initiator,
				DisplayName: u.Initiator,
			},
			StorageClass: "STANDARD",
			Initiated:    u.CreatedAt,
		})
	}

	writeXML(w, http.StatusOK, resp)
}

// handleListParts handles GET /<bucket>/<key>?uploadId=X.
func (rt *Router) handleListParts(w http.ResponseWriter, r *http.Request, bucket, key string) {
	reqID := RequestID(r.Context())
	q := r.URL.Query()

	uploadID := q.Get("uploadId")
	if uploadID == "" {
		writeS3Error(w, reqID, s3types.ErrInvalidArgument.WithMessage("Missing uploadId"))
		return
	}

	maxParts := 1000
	if v := q.Get("max-parts"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			maxParts = n
		}
	}

	partMarker := 0
	if v := q.Get("part-number-marker"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			partMarker = n
		}
	}

	parts, truncated, err := rt.store.ListParts(bucket, key, uploadID, maxParts, partMarker)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err))
		return
	}

	// Sort parts by part number
	sort.Slice(parts, func(i, j int) bool {
		return parts[i].PartNumber < parts[j].PartNumber
	})

	resp := s3types.ListPartsResult{
		Bucket:           bucket,
		Key:              key,
		UploadId:         uploadID,
		StorageClass:     "STANDARD",
		PartNumberMarker: partMarker,
		MaxParts:         maxParts,
		IsTruncated:      truncated,
	}

	if len(parts) > 0 {
		resp.NextPartNumberMarker = parts[len(parts)-1].PartNumber
	}

	for _, p := range parts {
		resp.Parts = append(resp.Parts, s3types.PartInfo{
			PartNumber:   p.PartNumber,
			LastModified: p.LastModified,
			ETag:         strings.Trim(p.ETag, "\""),
			Size:         p.Size,
		})
	}

	writeXML(w, http.StatusOK, resp)
}
