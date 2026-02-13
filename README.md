# Warehouse

An S3-compatible object storage server written in Go, designed for air-gapped and offline environments. Built with zero framework dependencies — only the Go standard library and a UUID generator.

## Features

### Core Object Operations
- **PutObject / GetObject / HeadObject / DeleteObject** — full CRUD with content-type, user metadata, and conditional headers (`If-Match`, `If-None-Match`, `If-Modified-Since`, `If-Unmodified-Since`)
- **CopyObject** — server-side copy between buckets
- **ListObjectsV2** — prefix filtering, delimiter-based grouping, pagination
- **Multi-object delete** — batch delete with quiet mode
- **Range requests** — partial content retrieval (`bytes=N-M`)

### Bucket Management
- **CreateBucket / DeleteBucket / HeadBucket / ListBuckets**
- **Bucket location** — configurable region per bucket

### Versioning
- **Enable / Suspend** versioning per bucket
- **Version-aware operations** — GET, HEAD, DELETE by version ID
- **Delete markers** — S3-compatible soft delete behaviour
- **ListObjectVersions** — list all versions and delete markers

### Multipart Uploads
- **Initiate / UploadPart / Complete / Abort**
- **ListMultipartUploads / ListParts**
- Proper multipart ETag calculation (MD5 of MD5s)

### Access Control
- **Canned ACLs** — `private`, `public-read`, `public-read-write`, `authenticated-read`
- **ACL XML** — full get/put for bucket and object ACLs
- **Bucket Policies** — JSON policy documents (get/put/delete)

### Lifecycle Rules
- **Object expiration** — by age (days) or date
- **Noncurrent version expiration** — clean up old versions
- **Abort incomplete multipart uploads** — by age
- **Expired delete marker cleanup**
- **Background processor** — runs on a configurable schedule

### Authentication
- **AWS Signature V4** — full implementation including canonical request, string-to-sign, and HMAC-SHA256 key derivation
- **Presigned URLs** — generate and verify time-limited presigned URLs
- **Simple auth** — header-based access-key/secret-key for development
- **Configurable mode** — `sigv4`, `simple`, or `both`

### Storage Engine
- **Content-addressable blob storage** — SHA-256 hashed blobs with 2-level fan-out directories
- **Automatic deduplication** — identical content stored once
- **Metadata index** — per-bucket JSON index with in-memory caching
- **Crash-safe writes** — temp file + atomic rename for blob storage
- **Persistence** — full state survives restarts

## Architecture

```
cmd/warehouse/         Entry point, server bootstrap, graceful shutdown
internal/
  api/                 HTTP routing, middleware, S3 request handlers
  auth/                AWS SigV4, presigned URLs, credential store
  config/              Configuration loading (JSON file + env vars)
  lifecycle/           Background lifecycle rule processor
  storage/             Storage interface + filesystem implementation
pkg/s3types/           S3 XML types and error codes
```

**Key design decisions:**
- **Interface-driven storage** — `storage.Backend` interface enables future backends (e.g., distributed storage, encrypted volumes)
- **Content-addressable blobs** — dedup, integrity verification, and clean separation of data from metadata
- **Per-bucket locking** — `sync.RWMutex` per bucket for concurrent access without global contention
- **Standard library HTTP** — Go 1.22+ enhanced `net/http` routing, no third-party routers

## Quick Start

### Build and Run

```bash
# Build
make build

# Run with defaults (listens on :9000, stores data in ./data)
make run

# Or run directly with environment variables
WAREHOUSE_LISTEN_ADDR=:9000 \
WAREHOUSE_DATA_DIR=/tmp/warehouse-data \
WAREHOUSE_LOG_LEVEL=debug \
./bin/warehouse
```

### Docker

```bash
# Build image
docker build -t warehouse:latest .

# Run container
docker run -d \
  --name warehouse \
  -p 9000:9000 \
  -v warehouse-data:/data \
  -e WAREHOUSE_LOG_LEVEL=info \
  warehouse:latest
```

### Test with curl (Simple Auth)

```bash
# Create a bucket
curl -X PUT http://localhost:9000/my-bucket \
  -H "X-Warehouse-Access-Key: <access-key>" \
  -H "X-Warehouse-Secret-Key: <secret-key>"

# Upload an object
curl -X PUT http://localhost:9000/my-bucket/hello.txt \
  -H "X-Warehouse-Access-Key: <access-key>" \
  -H "X-Warehouse-Secret-Key: <secret-key>" \
  -H "Content-Type: text/plain" \
  -d "Hello, Warehouse!"

# Download an object
curl http://localhost:9000/my-bucket/hello.txt \
  -H "X-Warehouse-Access-Key: <access-key>" \
  -H "X-Warehouse-Secret-Key: <secret-key>"

# List objects
curl http://localhost:9000/my-bucket?list-type=2 \
  -H "X-Warehouse-Access-Key: <access-key>" \
  -H "X-Warehouse-Secret-Key: <secret-key>"
```

### Test with AWS CLI

```bash
# Configure AWS CLI with Warehouse credentials
aws configure set aws_access_key_id <access-key>
aws configure set aws_secret_access_key <secret-key>
aws configure set region us-east-1

# Use --endpoint-url to point at Warehouse
aws --endpoint-url http://localhost:9000 s3 mb s3://test-bucket
aws --endpoint-url http://localhost:9000 s3 cp file.txt s3://test-bucket/
aws --endpoint-url http://localhost:9000 s3 ls s3://test-bucket/
aws --endpoint-url http://localhost:9000 s3 cp s3://test-bucket/file.txt ./downloaded.txt
```

## Configuration

Configuration is loaded from a JSON file (optional) and environment variables (override).

| Environment Variable | Default | Description |
|---|---|---|
| `WAREHOUSE_LISTEN_ADDR` | `:9000` | Server listen address |
| `WAREHOUSE_DATA_DIR` | `./data` | Data storage directory |
| `WAREHOUSE_AUTH_MODE` | `both` | Auth mode: `sigv4`, `simple`, `both` |
| `WAREHOUSE_REGION` | `us-east-1` | Default region |
| `WAREHOUSE_LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `WAREHOUSE_TLS_CERT` | | TLS certificate file path |
| `WAREHOUSE_TLS_KEY` | | TLS private key file path |
| `WAREHOUSE_DEFAULT_ACCESS_KEY` | *(auto-generated)* | Default access key |
| `WAREHOUSE_DEFAULT_SECRET_KEY` | *(auto-generated)* | Default secret key |
| `WAREHOUSE_MAX_OBJECT_SIZE` | `5368709120` | Max object size in bytes (5 GiB) |

### Config File

```bash
./bin/warehouse -config /etc/warehouse/config.json
```

```json
{
  "listen_addr": ":9000",
  "data_dir": "/var/lib/warehouse",
  "auth_mode": "sigv4",
  "region": "ap-southeast-2",
  "log_level": "info",
  "tls_cert_file": "/etc/ssl/warehouse.crt",
  "tls_key_file": "/etc/ssl/warehouse.key"
}
```

## Testing

```bash
# Run all tests
make test

# Verbose output
make test-verbose

# Race condition detection
make test-race

# Coverage report
make test-cover
```

## Dependencies

| Package | Purpose |
|---|---|
| `github.com/google/uuid` | UUID v4 generation for version IDs and upload IDs |

All other functionality is built on the Go standard library.

## License

MIT

## NOTE
This project was a one shot build from Claude Optus 4.6 Thinking.
This was the prompt:

I've just started a new repo, "Warehouse" in ~/repos/. I want you to build an S3 clone using only the latest version of golang. It can't use any major packages. Ask me up to 3 clarifying questions if needed, then start building until it's ready for testing. It must follow best practice coding standards, this project is going to be given to a potential new employer that may decide if I'm offered a job from this. Their business is providing AWS-like services in offline systems for the defence department. 

This was it's only 3 allowed questions and my responses:
- Which S3 API operations should be supported? This determines the scope of the build.
Full featured

- Does "no major packages" mean strictly Go standard library only? Or are small, focused packages acceptable (e.g., a UUID library)?
Minimal deps OK

- Should it implement AWS Signature V4 authentication? For a defence-oriented employer this would be a strong signal, but it's significant complexity.
Both

