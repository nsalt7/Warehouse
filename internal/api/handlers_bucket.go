package api

import (
	"encoding/json"
	"encoding/xml"
	"io"
	"net/http"
	"regexp"
	"time"

	"github.com/warehouse/warehouse/internal/storage"
	"github.com/warehouse/warehouse/pkg/s3types"
)

var bucketNameRegex = regexp.MustCompile(`^[a-z0-9][a-z0-9.\-]{1,61}[a-z0-9]$`)

// validateBucketName checks if a bucket name follows S3 naming rules.
func validateBucketName(name string) bool {
	if len(name) < 3 || len(name) > 63 {
		return false
	}
	return bucketNameRegex.MatchString(name)
}

// handleListBuckets handles GET / — lists all buckets.
func (rt *Router) handleListBuckets(w http.ResponseWriter, r *http.Request) {
	reqID := RequestID(r.Context())

	buckets, err := rt.store.ListBuckets()
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err))
		return
	}

	result := s3types.ListAllMyBucketsResult{
		Owner: s3types.Owner{
			ID:          AccessKey(r.Context()),
			DisplayName: AccessKey(r.Context()),
		},
		Buckets: make([]s3types.BucketInfo, len(buckets)),
	}

	for i, b := range buckets {
		result.Buckets[i] = s3types.BucketInfo{
			Name:         b.Name,
			CreationDate: b.CreatedAt,
		}
	}

	writeXML(w, http.StatusOK, result)
}

// handleCreateBucket handles PUT /<bucket> — creates a new bucket.
func (rt *Router) handleCreateBucket(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())

	if !validateBucketName(bucket) {
		writeS3Error(w, reqID, s3types.ErrInvalidBucketName.WithResource(bucket))
		return
	}

	// Parse optional location constraint
	var location string
	if r.ContentLength > 0 {
		body, err := io.ReadAll(io.LimitReader(r.Body, 10240))
		if err == nil && len(body) > 0 {
			var config s3types.CreateBucketConfiguration
			if err := xml.Unmarshal(body, &config); err == nil {
				location = config.LocationConstraint
			}
		}
	}
	if location == "" {
		location = rt.region
	}

	meta := storage.BucketMetadata{
		Name:      bucket,
		CreatedAt: time.Now().UTC(),
		Owner:     AccessKey(r.Context()),
		Region:    location,
	}

	if err := rt.store.CreateBucket(bucket, meta); err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(bucket))
		return
	}

	w.Header().Set("Location", "/"+bucket)
	writeSuccess(w, http.StatusOK)
}

// handleDeleteBucket handles DELETE /<bucket> — deletes a bucket.
func (rt *Router) handleDeleteBucket(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())

	if err := rt.store.DeleteBucket(bucket); err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(bucket))
		return
	}

	writeSuccess(w, http.StatusNoContent)
}

// handleHeadBucket handles HEAD /<bucket> — checks if a bucket exists.
func (rt *Router) handleHeadBucket(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())

	meta, err := rt.store.GetBucket(bucket)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(bucket))
		return
	}

	w.Header().Set("x-amz-bucket-region", meta.Region)
	writeSuccess(w, http.StatusOK)
}

// handleGetBucketLocation handles GET /<bucket>?location.
func (rt *Router) handleGetBucketLocation(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())

	meta, err := rt.store.GetBucket(bucket)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(bucket))
		return
	}

	result := s3types.LocationConstraint{Location: meta.Region}
	writeXML(w, http.StatusOK, result)
}

// handleGetBucketVersioning handles GET /<bucket>?versioning.
func (rt *Router) handleGetBucketVersioning(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())

	meta, err := rt.store.GetBucket(bucket)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(bucket))
		return
	}

	result := s3types.VersioningConfiguration{Status: meta.Versioning}
	writeXML(w, http.StatusOK, result)
}

// handlePutBucketVersioning handles PUT /<bucket>?versioning.
func (rt *Router) handlePutBucketVersioning(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())

	body, err := io.ReadAll(io.LimitReader(r.Body, 10240))
	if err != nil {
		writeS3Error(w, reqID, s3types.ErrIncompleteBody)
		return
	}

	var config s3types.VersioningConfiguration
	if err := xml.Unmarshal(body, &config); err != nil {
		writeS3Error(w, reqID, s3types.ErrMalformedXML)
		return
	}

	if config.Status != "Enabled" && config.Status != "Suspended" {
		writeS3Error(w, reqID, s3types.ErrIllegalVersioningConfiguration)
		return
	}

	meta, err := rt.store.GetBucket(bucket)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(bucket))
		return
	}

	meta.Versioning = config.Status
	if err := rt.store.UpdateBucket(bucket, *meta); err != nil {
		writeS3Error(w, reqID, mapStorageError(err))
		return
	}

	writeSuccess(w, http.StatusOK)
}

// handleGetBucketACL handles GET /<bucket>?acl.
func (rt *Router) handleGetBucketACL(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())

	meta, err := rt.store.GetBucket(bucket)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(bucket))
		return
	}

	result := s3types.AccessControlPolicy{
		Owner: s3types.Owner{
			ID:          meta.Owner,
			DisplayName: meta.Owner,
		},
	}

	if meta.ACL != nil {
		for _, g := range meta.ACL.Grants {
			grant := s3types.Grant{
				Grantee: s3types.Grantee{
					XSI:  "http://www.w3.org/2001/XMLSchema-instance",
					Type: g.GranteeType,
					ID:   g.GranteeID,
					URI:  g.GranteeURI,
				},
				Permission: g.Permission,
			}
			result.AccessControlList = append(result.AccessControlList, grant)
		}
	}

	writeXML(w, http.StatusOK, result)
}

// handlePutBucketACL handles PUT /<bucket>?acl.
func (rt *Router) handlePutBucketACL(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())

	meta, err := rt.store.GetBucket(bucket)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(bucket))
		return
	}

	// Check for canned ACL header
	cannedACL := r.Header.Get("X-Amz-Acl")
	if cannedACL != "" {
		acl := cannedACLToGrants(cannedACL, meta.Owner)
		if acl == nil {
			writeS3Error(w, reqID, s3types.ErrInvalidArgument.WithMessage("Invalid canned ACL: "+cannedACL))
			return
		}
		meta.ACL = acl
	} else {
		// Parse ACL XML body
		body, err := io.ReadAll(io.LimitReader(r.Body, 65536))
		if err != nil {
			writeS3Error(w, reqID, s3types.ErrIncompleteBody)
			return
		}

		var acp s3types.AccessControlPolicy
		if err := xml.Unmarshal(body, &acp); err != nil {
			writeS3Error(w, reqID, s3types.ErrMalformedACLError)
			return
		}

		meta.ACL = xmlACLToStorage(acp)
	}

	if err := rt.store.UpdateBucket(bucket, *meta); err != nil {
		writeS3Error(w, reqID, mapStorageError(err))
		return
	}

	writeSuccess(w, http.StatusOK)
}

// handleGetBucketPolicy handles GET /<bucket>?policy.
func (rt *Router) handleGetBucketPolicy(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())

	meta, err := rt.store.GetBucket(bucket)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(bucket))
		return
	}

	if len(meta.Policy) == 0 {
		writeS3Error(w, reqID, s3types.ErrNoSuchBucketPolicy.WithResource(bucket))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(meta.Policy)
}

// handlePutBucketPolicy handles PUT /<bucket>?policy.
func (rt *Router) handlePutBucketPolicy(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())

	body, err := io.ReadAll(io.LimitReader(r.Body, 20*1024))
	if err != nil {
		writeS3Error(w, reqID, s3types.ErrIncompleteBody)
		return
	}

	// Validate JSON
	var policy s3types.BucketPolicy
	if err := json.Unmarshal(body, &policy); err != nil {
		writeS3Error(w, reqID, s3types.ErrMalformedPolicy)
		return
	}

	meta, err := rt.store.GetBucket(bucket)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(bucket))
		return
	}

	meta.Policy = body
	if err := rt.store.UpdateBucket(bucket, *meta); err != nil {
		writeS3Error(w, reqID, mapStorageError(err))
		return
	}

	writeSuccess(w, http.StatusNoContent)
}

// handleDeleteBucketPolicy handles DELETE /<bucket>?policy.
func (rt *Router) handleDeleteBucketPolicy(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())

	meta, err := rt.store.GetBucket(bucket)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(bucket))
		return
	}

	meta.Policy = nil
	if err := rt.store.UpdateBucket(bucket, *meta); err != nil {
		writeS3Error(w, reqID, mapStorageError(err))
		return
	}

	writeSuccess(w, http.StatusNoContent)
}

// handlePutBucketLifecycle handles PUT /<bucket>?lifecycle.
func (rt *Router) handlePutBucketLifecycle(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())

	body, err := io.ReadAll(io.LimitReader(r.Body, 65536))
	if err != nil {
		writeS3Error(w, reqID, s3types.ErrIncompleteBody)
		return
	}

	var config s3types.LifecycleConfiguration
	if err := xml.Unmarshal(body, &config); err != nil {
		writeS3Error(w, reqID, s3types.ErrMalformedXML)
		return
	}

	meta, err := rt.store.GetBucket(bucket)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(bucket))
		return
	}

	meta.Lifecycle = xmlLifecycleToStorage(config)
	if err := rt.store.UpdateBucket(bucket, *meta); err != nil {
		writeS3Error(w, reqID, mapStorageError(err))
		return
	}

	writeSuccess(w, http.StatusOK)
}

// handleGetBucketLifecycle handles GET /<bucket>?lifecycle.
func (rt *Router) handleGetBucketLifecycle(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())

	meta, err := rt.store.GetBucket(bucket)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(bucket))
		return
	}

	if meta.Lifecycle == nil || len(meta.Lifecycle.Rules) == 0 {
		writeS3Error(w, reqID, s3types.ErrNoSuchLifecycleConfiguration.WithResource(bucket))
		return
	}

	result := storageLifecycleToXML(meta.Lifecycle)
	writeXML(w, http.StatusOK, result)
}

// handleDeleteBucketLifecycle handles DELETE /<bucket>?lifecycle.
func (rt *Router) handleDeleteBucketLifecycle(w http.ResponseWriter, r *http.Request, bucket string) {
	reqID := RequestID(r.Context())

	meta, err := rt.store.GetBucket(bucket)
	if err != nil {
		writeS3Error(w, reqID, mapStorageError(err).WithResource(bucket))
		return
	}

	meta.Lifecycle = nil
	if err := rt.store.UpdateBucket(bucket, *meta); err != nil {
		writeS3Error(w, reqID, mapStorageError(err))
		return
	}

	writeSuccess(w, http.StatusNoContent)
}

// ── ACL Helpers ─────────────────────────────────────────────────────────────

// cannedACLToGrants converts a canned ACL string to storage grants.
func cannedACLToGrants(canned, owner string) *storage.ACLConfig {
	ownerGrant := storage.ACLGrant{
		GranteeType: "CanonicalUser",
		GranteeID:   owner,
		Permission:  "FULL_CONTROL",
	}

	allUsersRead := storage.ACLGrant{
		GranteeType: "Group",
		GranteeURI:  "http://acs.amazonaws.com/groups/global/AllUsers",
		Permission:  "READ",
	}

	allUsersWrite := storage.ACLGrant{
		GranteeType: "Group",
		GranteeURI:  "http://acs.amazonaws.com/groups/global/AllUsers",
		Permission:  "WRITE",
	}

	authRead := storage.ACLGrant{
		GranteeType: "Group",
		GranteeURI:  "http://acs.amazonaws.com/groups/global/AuthenticatedUsers",
		Permission:  "READ",
	}

	switch canned {
	case "private":
		return &storage.ACLConfig{Grants: []storage.ACLGrant{ownerGrant}}
	case "public-read":
		return &storage.ACLConfig{Grants: []storage.ACLGrant{ownerGrant, allUsersRead}}
	case "public-read-write":
		return &storage.ACLConfig{Grants: []storage.ACLGrant{ownerGrant, allUsersRead, allUsersWrite}}
	case "authenticated-read":
		return &storage.ACLConfig{Grants: []storage.ACLGrant{ownerGrant, authRead}}
	default:
		return nil
	}
}

// xmlACLToStorage converts an XML ACL document to storage format.
func xmlACLToStorage(acp s3types.AccessControlPolicy) *storage.ACLConfig {
	config := &storage.ACLConfig{}
	for _, g := range acp.AccessControlList {
		config.Grants = append(config.Grants, storage.ACLGrant{
			GranteeType: g.Grantee.Type,
			GranteeID:   g.Grantee.ID,
			GranteeName: g.Grantee.DisplayName,
			GranteeURI:  g.Grantee.URI,
			Permission:  g.Permission,
		})
	}
	return config
}

// ── Lifecycle Helpers ───────────────────────────────────────────────────────

// xmlLifecycleToStorage converts XML lifecycle config to storage format.
func xmlLifecycleToStorage(config s3types.LifecycleConfiguration) *storage.LifecycleConfig {
	lc := &storage.LifecycleConfig{}
	for _, rule := range config.Rules {
		sr := storage.LifecycleRule{
			ID:     rule.ID,
			Status: rule.Status,
			Prefix: rule.Filter.Prefix,
		}
		if rule.Expiration != nil {
			sr.ExpirationDays = rule.Expiration.Days
			sr.ExpirationDate = rule.Expiration.Date
			sr.ExpiredObjectDeleteMarker = rule.Expiration.ExpiredObjectDeleteMarker
		}
		if rule.NoncurrentVersionExpiration != nil {
			sr.NoncurrentVersionExpirationDays = rule.NoncurrentVersionExpiration.NoncurrentDays
		}
		if rule.AbortIncompleteMultipartUpload != nil {
			sr.AbortMultipartDays = rule.AbortIncompleteMultipartUpload.DaysAfterInitiation
		}
		lc.Rules = append(lc.Rules, sr)
	}
	return lc
}

// storageLifecycleToXML converts storage lifecycle config to XML format.
func storageLifecycleToXML(lc *storage.LifecycleConfig) s3types.LifecycleConfiguration {
	config := s3types.LifecycleConfiguration{}
	for _, rule := range lc.Rules {
		xr := s3types.LifecycleRule{
			ID:     rule.ID,
			Status: rule.Status,
			Filter: s3types.LifecycleFilter{Prefix: rule.Prefix},
		}
		if rule.ExpirationDays > 0 || rule.ExpirationDate != "" || rule.ExpiredObjectDeleteMarker {
			xr.Expiration = &s3types.LifecycleExpiration{
				Days:                      rule.ExpirationDays,
				Date:                      rule.ExpirationDate,
				ExpiredObjectDeleteMarker: rule.ExpiredObjectDeleteMarker,
			}
		}
		if rule.NoncurrentVersionExpirationDays > 0 {
			xr.NoncurrentVersionExpiration = &s3types.NoncurrentVersionExpiration{
				NoncurrentDays: rule.NoncurrentVersionExpirationDays,
			}
		}
		if rule.AbortMultipartDays > 0 {
			xr.AbortIncompleteMultipartUpload = &s3types.AbortIncompleteMultipartUpload{
				DaysAfterInitiation: rule.AbortMultipartDays,
			}
		}
		config.Rules = append(config.Rules, xr)
	}
	return config
}
