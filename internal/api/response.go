// Package api provides the HTTP API layer for the Warehouse S3 server.
package api

import (
	"encoding/xml"
	"fmt"
	"net/http"
	"time"
)

const (
	xmlHeader = `<?xml version="1.0" encoding="UTF-8"?>` + "\n"
)

// writeXML writes an XML response with the given status code.
func writeXML(w http.ResponseWriter, statusCode int, v interface{}) {
	data, err := xml.MarshalIndent(v, "", "  ")
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/xml")
	w.WriteHeader(statusCode)
	fmt.Fprint(w, xmlHeader)
	w.Write(data)
}

// writeSuccess writes a successful response with no body (e.g., 200 or 204).
func writeSuccess(w http.ResponseWriter, statusCode int) {
	w.WriteHeader(statusCode)
}

// setCommonHeaders sets common S3 response headers.
func setCommonHeaders(w http.ResponseWriter, requestID string) {
	w.Header().Set("x-amz-request-id", requestID)
	w.Header().Set("x-amz-id-2", requestID)
	w.Header().Set("Server", "Warehouse")
	w.Header().Set("Date", time.Now().UTC().Format(http.TimeFormat))
}

// setObjectHeaders sets headers from object metadata.
func setObjectHeaders(w http.ResponseWriter, etag, contentType, versionID string, size int64, lastModified time.Time, userMeta map[string]string) {
	w.Header().Set("ETag", etag)
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", fmt.Sprintf("%d", size))
	w.Header().Set("Last-Modified", lastModified.UTC().Format(http.TimeFormat))
	w.Header().Set("Accept-Ranges", "bytes")

	if versionID != "" && versionID != "null" {
		w.Header().Set("x-amz-version-id", versionID)
	}

	for k, v := range userMeta {
		w.Header().Set("x-amz-meta-"+k, v)
	}
}
