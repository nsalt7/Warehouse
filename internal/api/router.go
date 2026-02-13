package api

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/warehouse/warehouse/internal/auth"
	"github.com/warehouse/warehouse/internal/storage"
	"github.com/warehouse/warehouse/pkg/s3types"
)

// Router holds all dependencies and provides the HTTP handler.
type Router struct {
	store     storage.Backend
	credStore *auth.CredentialStore
	sigv4     *auth.SigV4Verifier
	presigned *auth.PresignedVerifier
	logger    *slog.Logger
	region    string
	authMode  AuthMode
}

// RouterConfig holds configuration for creating a new Router.
type RouterConfig struct {
	Store     storage.Backend
	CredStore *auth.CredentialStore
	SigV4     *auth.SigV4Verifier
	Presigned *auth.PresignedVerifier
	Logger    *slog.Logger
	Region    string
	AuthMode  string // "sigv4", "simple", "both"
}

// NewRouter creates a new API router with all S3 endpoints.
func NewRouter(cfg RouterConfig) http.Handler {
	mode := AuthModeBoth
	switch cfg.AuthMode {
	case "sigv4":
		mode = AuthModeSigV4
	case "simple":
		mode = AuthModeSimple
	}

	r := &Router{
		store:     cfg.Store,
		credStore: cfg.CredStore,
		sigv4:     cfg.SigV4,
		presigned: cfg.Presigned,
		logger:    cfg.Logger,
		region:    cfg.Region,
		authMode:  mode,
	}

	// The S3 API uses a single path structure: /<bucket>/<key...>
	// We implement custom routing because S3's API is action-based via query params and headers.
	mux := http.NewServeMux()

	// Health check endpoint (unauthenticated)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	// All S3 operations go through a single handler that dispatches by method + query params
	mux.HandleFunc("/", r.dispatch)

	// Apply middleware
	handler := chain(
		mux,
		authMiddleware(cfg.SigV4, cfg.Presigned, cfg.CredStore, mode, cfg.Logger),
		loggingMiddleware(cfg.Logger),
		requestIDMiddleware,
	)

	return handler
}

// dispatch routes requests based on path, method, and query parameters.
func (rt *Router) dispatch(w http.ResponseWriter, r *http.Request) {
	reqID := RequestID(r.Context())
	bucket, key := parsePath(r.URL.Path)

	// Service-level operations (no bucket specified)
	if bucket == "" {
		switch r.Method {
		case http.MethodGet:
			rt.handleListBuckets(w, r)
		default:
			writeS3Error(w, reqID, s3types.ErrMethodNotAllowed)
		}
		return
	}

	// Bucket-level operations (bucket specified, no key)
	if key == "" {
		rt.dispatchBucket(w, r, bucket)
		return
	}

	// Object-level operations
	rt.dispatchObject(w, r, bucket, key)
}

// dispatchBucket routes bucket-level operations.
func (rt *Router) dispatchBucket(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())
	q := r.URL.Query()

	switch r.Method {
	case http.MethodPut:
		if _, ok := q["versioning"]; ok {
			rt.handlePutBucketVersioning(w, r, bucket)
		} else if _, ok := q["acl"]; ok {
			rt.handlePutBucketACL(w, r, bucket)
		} else if _, ok := q["policy"]; ok {
			rt.handlePutBucketPolicy(w, r, bucket)
		} else if _, ok := q["lifecycle"]; ok {
			rt.handlePutBucketLifecycle(w, r, bucket)
		} else {
			rt.handleCreateBucket(w, r, bucket)
		}

	case http.MethodGet, http.MethodHead:
		if _, ok := q["versioning"]; ok {
			rt.handleGetBucketVersioning(w, r, bucket)
		} else if _, ok := q["acl"]; ok {
			rt.handleGetBucketACL(w, r, bucket)
		} else if _, ok := q["policy"]; ok {
			rt.handleGetBucketPolicy(w, r, bucket)
		} else if _, ok := q["lifecycle"]; ok {
			rt.handleGetBucketLifecycle(w, r, bucket)
		} else if _, ok := q["location"]; ok {
			rt.handleGetBucketLocation(w, r, bucket)
		} else if _, ok := q["uploads"]; ok {
			rt.handleListMultipartUploads(w, r, bucket)
		} else if _, ok := q["versions"]; ok {
			rt.handleListObjectVersions(w, r, bucket)
		} else if q.Get("list-type") == "2" {
			rt.handleListObjectsV2(w, r, bucket)
		} else if r.Method == http.MethodHead {
			rt.handleHeadBucket(w, r, bucket)
		} else {
			// Default GET on bucket = ListObjectsV2
			rt.handleListObjectsV2(w, r, bucket)
		}

	case http.MethodDelete:
		if _, ok := q["policy"]; ok {
			rt.handleDeleteBucketPolicy(w, r, bucket)
		} else if _, ok := q["lifecycle"]; ok {
			rt.handleDeleteBucketLifecycle(w, r, bucket)
		} else {
			rt.handleDeleteBucket(w, r, bucket)
		}

	case http.MethodPost:
		if _, ok := q["delete"]; ok {
			rt.handleDeleteMultipleObjects(w, r, bucket)
		} else {
			writeS3Error(w, reqID, s3types.ErrMethodNotAllowed)
		}

	default:
		writeS3Error(w, reqID, s3types.ErrMethodNotAllowed)
	}
}

// dispatchObject routes object-level operations.
func (rt *Router) dispatchObject(w http.ResponseWriter, r *http.Request, bucket, key string) {
	reqID := RequestID(r.Context())
	q := r.URL.Query()

	switch r.Method {
	case http.MethodPut:
		if _, ok := q["acl"]; ok {
			rt.handlePutObjectACL(w, r, bucket, key)
		} else if q.Get("partNumber") != "" && q.Get("uploadId") != "" {
			rt.handleUploadPart(w, r, bucket, key)
		} else {
			// Check for copy source header
			if r.Header.Get("X-Amz-Copy-Source") != "" {
				rt.handleCopyObject(w, r, bucket, key)
			} else {
				rt.handlePutObject(w, r, bucket, key)
			}
		}

	case http.MethodGet:
		if _, ok := q["acl"]; ok {
			rt.handleGetObjectACL(w, r, bucket, key)
		} else if q.Get("uploadId") != "" {
			rt.handleListParts(w, r, bucket, key)
		} else {
			rt.handleGetObject(w, r, bucket, key)
		}

	case http.MethodHead:
		rt.handleHeadObject(w, r, bucket, key)

	case http.MethodDelete:
		if q.Get("uploadId") != "" {
			rt.handleAbortMultipartUpload(w, r, bucket, key)
		} else {
			rt.handleDeleteObject(w, r, bucket, key)
		}

	case http.MethodPost:
		if _, ok := q["uploads"]; ok {
			rt.handleInitiateMultipartUpload(w, r, bucket, key)
		} else if q.Get("uploadId") != "" {
			rt.handleCompleteMultipartUpload(w, r, bucket, key)
		} else {
			writeS3Error(w, reqID, s3types.ErrMethodNotAllowed)
		}

	default:
		writeS3Error(w, reqID, s3types.ErrMethodNotAllowed)
	}
}

// parsePath extracts bucket and key from the request path.
// Path format: /<bucket>/<key...>
func parsePath(path string) (bucket, key string) {
	// Remove leading slash
	path = strings.TrimPrefix(path, "/")
	if path == "" {
		return "", ""
	}

	idx := strings.IndexByte(path, '/')
	if idx < 0 {
		return path, ""
	}

	return path[:idx], path[idx+1:]
}
