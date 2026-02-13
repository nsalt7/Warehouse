package api

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/warehouse/warehouse/internal/auth"
	"github.com/warehouse/warehouse/pkg/s3types"
)

type contextKey string

const (
	ctxRequestID contextKey = "request_id"
	ctxAccessKey contextKey = "access_key"
)

// RequestID extracts the request ID from context.
func RequestID(ctx context.Context) string {
	if v, ok := ctx.Value(ctxRequestID).(string); ok {
		return v
	}
	return ""
}

// AccessKey extracts the authenticated access key from context.
func AccessKey(ctx context.Context) string {
	if v, ok := ctx.Value(ctxAccessKey).(string); ok {
		return v
	}
	return ""
}

// requestIDMiddleware assigns a unique request ID to each request.
func requestIDMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := uuid.New().String()
		ctx := context.WithValue(r.Context(), ctxRequestID, id)
		setCommonHeaders(w, id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// loggingMiddleware logs request details.
func loggingMiddleware(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}

			next.ServeHTTP(sw, r)

			logger.Info("request",
				"method", r.Method,
				"path", r.URL.Path,
				"query", r.URL.RawQuery,
				"status", sw.status,
				"duration", time.Since(start).String(),
				"remote", r.RemoteAddr,
				"request_id", RequestID(r.Context()),
			)
		})
	}
}

// statusWriter captures the response status code for logging.
type statusWriter struct {
	http.ResponseWriter
	status int
	written bool
}

func (w *statusWriter) WriteHeader(code int) {
	if !w.written {
		w.status = code
		w.written = true
	}
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if !w.written {
		w.written = true
	}
	return w.ResponseWriter.Write(b)
}

// AuthMode controls which authentication methods are accepted.
type AuthMode int

const (
	AuthModeSigV4  AuthMode = iota // SigV4 only
	AuthModeSimple                 // Simple header-based auth only
	AuthModeBoth                   // Accept either
)

// authMiddleware authenticates requests using SigV4 and/or simple auth.
func authMiddleware(
	sigv4 *auth.SigV4Verifier,
	presigned *auth.PresignedVerifier,
	credStore *auth.CredentialStore,
	mode AuthMode,
	logger *slog.Logger,
) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			reqID := RequestID(r.Context())
			var accessKeyID string
			var authenticated bool

			// Check for presigned URL first
			if auth.IsPresigned(r) {
				keyID, err := presigned.VerifyPresigned(r)
				if err != nil {
					logger.Warn("presigned auth failed", "error", err, "request_id", reqID)
					writeS3Error(w, reqID, s3types.ErrSignatureDoesNotMatch)
					return
				}
				accessKeyID = keyID
				authenticated = true
			}

			// Check SigV4 Authorization header
			if !authenticated && r.Header.Get("Authorization") != "" {
				if mode == AuthModeSigV4 || mode == AuthModeBoth {
					keyID, err := sigv4.VerifyRequest(r)
					if err != nil {
						logger.Warn("sigv4 auth failed", "error", err, "request_id", reqID)
						// Don't fail yet if "both" mode — try simple auth
						if mode != AuthModeBoth {
							writeS3Error(w, reqID, s3types.ErrSignatureDoesNotMatch)
							return
						}
					} else {
						accessKeyID = keyID
						authenticated = true
					}
				}
			}

			// Check simple auth (custom header-based)
			if !authenticated {
				if mode == AuthModeSimple || mode == AuthModeBoth {
					keyID := r.Header.Get("X-Warehouse-Access-Key")
					secretKey := r.Header.Get("X-Warehouse-Secret-Key")
					if keyID != "" && secretKey != "" {
						cred, ok := credStore.GetCredential(keyID)
						if ok && cred.SecretAccessKey == secretKey {
							accessKeyID = keyID
							authenticated = true
						} else {
							logger.Warn("simple auth failed", "access_key", keyID, "request_id", reqID)
						}
					}
				}
			}

			if !authenticated {
				writeS3Error(w, reqID, s3types.ErrAccessDenied)
				return
			}

			ctx := context.WithValue(r.Context(), ctxAccessKey, accessKeyID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// chain applies middleware in order (first middleware wraps outermost).
func chain(handler http.Handler, middlewares ...func(http.Handler) http.Handler) http.Handler {
	for i := len(middlewares) - 1; i >= 0; i-- {
		handler = middlewares[i](handler)
	}
	return handler
}
