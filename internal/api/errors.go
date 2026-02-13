package api

import (
	"errors"
	"net/http"

	"github.com/warehouse/warehouse/internal/storage"
	"github.com/warehouse/warehouse/pkg/s3types"
)

// writeS3Error writes an S3-compatible error response.
func writeS3Error(w http.ResponseWriter, requestID string, s3err *s3types.S3Error) {
	resp := s3types.ErrorResponse{
		Code:      s3err.Code,
		Message:   s3err.Message,
		Resource:  s3err.Resource,
		RequestId: requestID,
	}
	writeXML(w, s3err.StatusCode, resp)
}

// mapStorageError maps a storage-layer error to an S3 error response.
func mapStorageError(err error) *s3types.S3Error {
	switch {
	case errors.Is(err, storage.ErrBucketExists):
		return s3types.ErrBucketAlreadyOwnedByYou
	case errors.Is(err, storage.ErrBucketNotFound):
		return s3types.ErrNoSuchBucket
	case errors.Is(err, storage.ErrBucketNotEmpty):
		return s3types.ErrBucketNotEmpty
	case errors.Is(err, storage.ErrObjectNotFound):
		return s3types.ErrNoSuchKey
	case errors.Is(err, storage.ErrObjectIsDeleteMarker):
		return s3types.ErrNoSuchKey
	case errors.Is(err, storage.ErrVersionNotFound):
		return s3types.ErrNoSuchVersion
	case errors.Is(err, storage.ErrUploadNotFound):
		return s3types.ErrNoSuchUpload
	case errors.Is(err, storage.ErrPartNotFound):
		return s3types.ErrInvalidPart
	default:
		return s3types.ErrInternalError
	}
}
