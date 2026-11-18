package services

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// ------------------------------------------------------------------
// Object storage abstraction. STORAGE_BACKEND=local (default) keeps the
// existing on-disk behaviour; "s3" uses any S3-compatible service (AWS S3,
// MinIO, Cloudflare R2). All knobs are env-driven. Public URLs can be served
// through a CDN by setting STORAGE_PUBLIC_URL.
//
// The implementation lives on storageProvider so it can be constructed with
// explicit config in tests (and, later, with non-env config sources) rather
// than being permanently bound to the package-level sync.Once.
// ------------------------------------------------------------------

type StorageConfig struct {
	Backend    string // local | s3
	Endpoint   string
	Bucket     string
	Region     string
	AccessKey  string
	SecretKey  string
	UseSSL     bool
	PublicURL  string
	LocalDir   string
}

func LoadStorageConfig() StorageConfig {
	c := StorageConfig{
		Backend:   strings.ToLower(strings.TrimSpace(os.Getenv("STORAGE_BACKEND"))),
		Endpoint:  os.Getenv("STORAGE_ENDPOINT"),
		Bucket:    os.Getenv("STORAGE_BUCKET"),
		Region:    os.Getenv("STORAGE_REGION"),
		AccessKey: os.Getenv("STORAGE_ACCESS_KEY"),
		SecretKey: os.Getenv("STORAGE_SECRET_KEY"),
		PublicURL: strings.TrimRight(os.Getenv("STORAGE_PUBLIC_URL"), "/"),
		LocalDir:  os.Getenv("STORAGE_LOCAL_DIR"),
	}
	if c.Backend == "" {
		c.Backend = "local"
	}
	if c.LocalDir == "" {
		c.LocalDir = "./uploads"
	}
	if c.Region == "" {
		c.Region = "us-east-1"
	}
	c.UseSSL = strings.EqualFold(os.Getenv("STORAGE_USE_SSL"), "1") || strings.EqualFold(os.Getenv("STORAGE_USE_SSL"), "true")
	return c
}

type storageProvider struct {
	cfg    StorageConfig
	client *minio.Client
}

func newStorageProvider(cfg StorageConfig) *storageProvider {
	p := &storageProvider{cfg: cfg}
	if cfg.Backend == "s3" && cfg.Endpoint != "" {
		client, err := minio.New(cfg.Endpoint, &minio.Options{
			Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
			Secure: cfg.UseSSL,
			Region: cfg.Region,
		})
		if err == nil {
			p.client = client
		}
	}
	return p
}

var storage struct {
	sync.Once
	provider *storageProvider
}

func storageRuntime() *storageProvider {
	storage.Do(func() {
		storage.provider = newStorageProvider(LoadStorageConfig())
	})
	return storage.provider
}

// StorageURL returns the public URL for a stored object key.
func (p *storageProvider) url(key string) string {
	if p.cfg.Backend == "s3" && p.cfg.PublicURL != "" {
		return p.cfg.PublicURL + "/" + key
	}
	return "/" + key // local: served by gin Static / nginx proxy
}

func StorageURL(key string) string { return storageRuntime().url(key) }

// StorageObject describes a stored object for the admin media library.
type StorageObject struct {
	Name     string
	Size     int64
	Modified string
	URL      string
}

// StorageIsS3 reports whether the S3 backend is active.
func StorageIsS3() bool {
	p := storageRuntime()
	return p.cfg.Backend == "s3" && p.client != nil
}

// ListObjects lists objects under a tenant prefix.
func (p *storageProvider) list(ctx context.Context, prefix string) ([]StorageObject, error) {
	out := []StorageObject{}
	if p.cfg.Backend == "s3" {
		if p.client == nil || p.cfg.Bucket == "" {
			return out, fmt.Errorf("S3 storage not configured")
		}
		opts := minio.ListObjectsOptions{Prefix: prefix + "/", Recursive: true}
		for obj := range p.client.ListObjects(ctx, p.cfg.Bucket, opts) {
			if obj.Err != nil {
				continue
			}
			parts := strings.Split(obj.Key, "/")
			out = append(out, StorageObject{
				Name:     parts[len(parts)-1],
				Size:     obj.Size,
				Modified: obj.LastModified.UTC().Format("2006-01-02T15:04:05Z"),
				URL:      p.url(obj.Key),
			})
		}
		return out, nil
	}
	// local
	entries, err := os.ReadDir(filepath.Join(p.cfg.LocalDir, filepath.FromSlash(prefix)))
	if err != nil {
		return out, nil
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, StorageObject{
			Name: e.Name(), Size: info.Size(),
			Modified: info.ModTime().UTC().Format("2006-01-02T15:04:05Z"),
			URL:      p.url(prefix + "/" + e.Name()),
		})
	}
	return out, nil
}

func ListObjects(ctx context.Context, prefix string) ([]StorageObject, error) {
	return storageRuntime().list(ctx, prefix)
}

// DeleteObject removes an object by tenant-scoped key.
func (p *storageProvider) delete(ctx context.Context, key string) error {
	if p.cfg.Backend == "s3" {
		if p.client == nil || p.cfg.Bucket == "" {
			return fmt.Errorf("S3 storage not configured")
		}
		return p.client.RemoveObject(ctx, p.cfg.Bucket, key, minio.RemoveObjectOptions{})
	}
	return os.Remove(filepath.Join(p.cfg.LocalDir, filepath.FromSlash(key)))
}

func DeleteObject(ctx context.Context, key string) error {
	return storageRuntime().delete(ctx, key)
}

// PutObject stores bytes at key. Key uses "<restaurant>/<name>" form.
func (p *storageProvider) put(ctx context.Context, key string, size int64, reader io.Reader, ct string) (string, error) {
	if p.cfg.Backend == "s3" {
		if p.client == nil {
			return "", fmt.Errorf("S3 storage backend configured but client init failed")
		}
		if p.cfg.Bucket == "" {
			return "", fmt.Errorf("STORAGE_BUCKET required for s3 backend")
		}
		_, err := p.client.PutObject(ctx, p.cfg.Bucket, key, reader, size, minio.PutObjectOptions{ContentType: ct})
		if err != nil {
			return "", err
		}
		return p.url(key), nil
	}
	// local backend
	full := filepath.Join(p.cfg.LocalDir, filepath.FromSlash(key))
	if err := os.MkdirAll(filepath.Dir(full), 0755); err != nil {
		return "", err
	}
	out, err := os.Create(full)
	if err != nil {
		return "", err
	}
	defer out.Close()
	if _, err := io.Copy(out, reader); err != nil {
		return "", err
	}
	return p.url(key), nil
}

func PutObject(ctx context.Context, key string, size int64, reader io.Reader, ct string) (string, error) {
	return storageRuntime().put(ctx, key, size, reader, ct)
}
