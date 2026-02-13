// Package lifecycle provides a background processor for S3 lifecycle rules.
package lifecycle

import (
	"context"
	"log/slog"
	"time"

	"github.com/warehouse/warehouse/internal/storage"
)

// Processor runs lifecycle rules on a periodic schedule.
type Processor struct {
	store    storage.Backend
	interval time.Duration
	logger   *slog.Logger
}

// NewProcessor creates a new lifecycle processor.
func NewProcessor(store storage.Backend, interval time.Duration, logger *slog.Logger) *Processor {
	return &Processor{
		store:    store,
		interval: interval,
		logger:   logger,
	}
}

// Start begins the lifecycle processing loop. It blocks until ctx is cancelled.
func (p *Processor) Start(ctx context.Context) {
	p.logger.Info("lifecycle processor started", "interval", p.interval.String())

	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()

	// Run once immediately on startup
	p.runCycle()

	for {
		select {
		case <-ctx.Done():
			p.logger.Info("lifecycle processor stopping")
			return
		case <-ticker.C:
			p.runCycle()
		}
	}
}

// runCycle performs a single lifecycle evaluation across all buckets.
func (p *Processor) runCycle() {
	now := time.Now().UTC()
	p.logger.Debug("lifecycle cycle starting", "time", now)

	buckets, err := p.store.ListBuckets()
	if err != nil {
		p.logger.Error("lifecycle: failed to list buckets", "error", err)
		return
	}

	for _, bucket := range buckets {
		if bucket.Lifecycle == nil || len(bucket.Lifecycle.Rules) == 0 {
			continue
		}

		p.processBucket(bucket.Name, bucket.Lifecycle.Rules, now)
	}
}

// processBucket evaluates lifecycle rules for a single bucket.
func (p *Processor) processBucket(bucketName string, rules []storage.LifecycleRule, now time.Time) {
	// Process object expiration
	expired, err := p.store.GetExpiredObjects(bucketName, rules, now)
	if err != nil {
		p.logger.Error("lifecycle: failed to get expired objects",
			"bucket", bucketName, "error", err)
		return
	}

	for _, obj := range expired {
		if _, err := p.store.DeleteObject(bucketName, obj.Key, obj.VersionID); err != nil {
			p.logger.Error("lifecycle: failed to delete expired object",
				"bucket", bucketName, "key", obj.Key,
				"version", obj.VersionID, "error", err)
		} else {
			p.logger.Info("lifecycle: deleted expired object",
				"bucket", bucketName, "key", obj.Key,
				"version", obj.VersionID)
		}
	}

	// Process incomplete multipart upload cleanup
	for _, rule := range rules {
		if rule.Status != "Enabled" || rule.AbortMultipartDays <= 0 {
			continue
		}

		uploads, err := p.store.GetExpiredMultipartUploads(bucketName, rule.AbortMultipartDays, now)
		if err != nil {
			p.logger.Error("lifecycle: failed to get expired uploads",
				"bucket", bucketName, "error", err)
			continue
		}

		for _, upload := range uploads {
			if err := p.store.AbortMultipartUpload(bucketName, upload.Key, upload.UploadID); err != nil {
				p.logger.Error("lifecycle: failed to abort expired upload",
					"bucket", bucketName, "key", upload.Key,
					"upload_id", upload.UploadID, "error", err)
			} else {
				p.logger.Info("lifecycle: aborted expired multipart upload",
					"bucket", bucketName, "key", upload.Key,
					"upload_id", upload.UploadID)
			}
		}
	}
}
