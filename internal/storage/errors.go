package storage

import "errors"

// Sentinel errors for storage operations.
var (
	ErrBucketExists        = errors.New("bucket already exists")
	ErrBucketNotFound      = errors.New("bucket not found")
	ErrBucketNotEmpty      = errors.New("bucket not empty")
	ErrObjectNotFound      = errors.New("object not found")
	ErrObjectIsDeleteMarker = errors.New("object is a delete marker")
	ErrVersionNotFound     = errors.New("version not found")
	ErrUploadNotFound      = errors.New("upload not found")
	ErrPartNotFound        = errors.New("part not found")
)
