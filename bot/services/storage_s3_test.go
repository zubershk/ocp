package services

import (
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// mockS3 implements just enough of the S3 API for minio-go's PutObject,
// ListObjectsV2 and RemoveObject calls. Signatures are intentionally ignored.
type mockS3 struct {
	mu      sync.Mutex
	objects map[string][]byte
	bucket  string
}

type listBucketResult struct {
	XMLName     xml.Name `xml:"ListBucketResult"`
	Xmlns       string   `xml:"xmlns,attr"`
	Name        string   `xml:"Name"`
	Prefix      string   `xml:"Prefix"`
	KeyCount    int      `xml:"KeyCount"`
	MaxKeys     int      `xml:"MaxKeys"`
	IsTruncated bool     `xml:"IsTruncated"`
	Contents    []struct {
		Key          string `xml:"Key"`
		LastModified string `xml:"LastModified"`
		ETag         string `xml:"ETag"`
		Size         int64  `xml:"Size"`
		StorageClass string `xml:"StorageClass"`
	} `xml:"Contents"`
}

// decodeAWSChunked unwraps the "aws-chunked" streaming format minio-go uses
// for SigV4 over plain HTTP: each chunk is "<hex-size>;chunk-signature=..\r\n"
// followed by exactly that many bytes and a trailing CRLF.
func decodeAWSChunked(body []byte) []byte {
	if !bytes.Contains(body, []byte(";chunk-signature=")) {
		return body // ordinary PUT body
	}
	var out []byte
	for len(body) > 0 {
		nl := bytes.Index(body, []byte("\r\n"))
		if nl < 0 {
			break
		}
		header := string(body[:nl])
		body = body[nl+2:]
		size := 0
		if _, err := fmt.Sscanf(strings.SplitN(header, ";", 2)[0], "%x", &size); err != nil || size == 0 {
			break
		}
		if size > len(body) {
			break
		}
		out = append(out, body[:size]...)
		body = body[size:]
		body = bytes.TrimPrefix(body, []byte("\r\n"))
	}
	return out
}

func (m *mockS3) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimPrefix(r.URL.Path, "/"+m.bucket)
	key = strings.TrimPrefix(key, "/")
	m.mu.Lock()
	defer m.mu.Unlock()

	switch {
	case r.Method == http.MethodPut && key != "":
		body, _ := io.ReadAll(r.Body)
		m.objects[key] = decodeAWSChunked(body)
		w.Header().Set("ETag", `"mock-etag"`)
		w.WriteHeader(http.StatusOK)
	case r.Method == http.MethodGet && key == "" && r.URL.Query().Get("list-type") == "2":
		prefix := r.URL.Query().Get("prefix")
		res := listBucketResult{
			Xmlns: "http://s3.amazonaws.com/doc/2006-03-01/",
			Name:  m.bucket, Prefix: prefix, MaxKeys: 1000, IsTruncated: false,
		}
		for k, v := range m.objects {
			if !strings.HasPrefix(k, prefix) {
				continue
			}
			res.Contents = append(res.Contents, struct {
				Key          string `xml:"Key"`
				LastModified string `xml:"LastModified"`
				ETag         string `xml:"ETag"`
				Size         int64  `xml:"Size"`
				StorageClass string `xml:"StorageClass"`
			}{
				Key: k, LastModified: time.Now().UTC().Format("2006-01-02T15:04:05.000Z"),
				ETag: `"mock-etag"`, Size: int64(len(v)), StorageClass: "STANDARD",
			})
		}
		res.KeyCount = len(res.Contents)
		w.Header().Set("Content-Type", "application/xml")
		_ = xml.NewEncoder(w).Encode(res)
	case r.Method == http.MethodDelete && key != "":
		delete(m.objects, key)
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "unexpected "+r.Method+" "+r.URL.Path, http.StatusBadRequest)
	}
}

func TestS3StorageBackend(t *testing.T) {
	mock := &mockS3{objects: map[string][]byte{}, bucket: "ocp"}
	srv := httptest.NewServer(mock)
	defer srv.Close()

	cfg := StorageConfig{
		Backend: "s3", Endpoint: strings.TrimPrefix(srv.URL, "http://"),
		Bucket: "ocp", Region: "us-east-1", AccessKey: "test", SecretKey: "test",
		UseSSL: false, PublicURL: "https://cdn.example.com",
	}
	p := newStorageProvider(cfg)
	if p.client == nil {
		t.Fatal("minio client failed to initialise")
	}

	ctx := context.Background()
	payload := []byte("pizza-menu-bytes")
	const key = "1/test-menu.txt"

	url, err := p.put(ctx, key, int64(len(payload)), bytes.NewReader(payload), "text/plain")
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	if want := "https://cdn.example.com/" + key; url != want {
		t.Fatalf("put URL = %q, want %q", url, want)
	}

	objs, err := p.list(ctx, "1")
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(objs) != 1 || objs[0].Name != "test-menu.txt" || objs[0].Size != int64(len(payload)) {
		t.Fatalf("list = %+v, want one object %q size %d", objs, "test-menu.txt", len(payload))
	}
	if want := "https://cdn.example.com/" + key; objs[0].URL != want {
		t.Fatalf("list URL = %q, want %q", objs[0].URL, want)
	}

	if err := p.delete(ctx, key); err != nil {
		t.Fatalf("delete: %v", err)
	}
	objs, err = p.list(ctx, "1")
	if err != nil || len(objs) != 0 {
		t.Fatalf("list after delete = %+v, err %v; want empty", objs, err)
	}
}

func TestS3StorageRequiresConfig(t *testing.T) {
	// s3 backend without endpoint degrades to a nil client rather than panicking.
	p := newStorageProvider(StorageConfig{Backend: "s3", Bucket: "ocp"})
	if _, err := p.put(context.Background(), "1/x", 1, strings.NewReader("x"), "text/plain"); err == nil {
		t.Fatal("expected error when S3 client is unavailable")
	}
	if _, err := p.list(context.Background(), "1"); err == nil {
		t.Fatal("expected error when S3 client is unavailable")
	}
}

func TestLocalStorageBackend(t *testing.T) {
	dir := t.TempDir()
	p := newStorageProvider(StorageConfig{Backend: "local", LocalDir: dir})
	ctx := context.Background()

	url, err := p.put(ctx, "7/photo.png", 5, strings.NewReader("image"), "image/png")
	if err != nil {
		t.Fatalf("put: %v", err)
	}
	if url != "/7/photo.png" {
		t.Fatalf("url = %q, want /7/photo.png", url)
	}
	if b, err := os.ReadFile(filepath.Join(dir, "7", "photo.png")); err != nil || string(b) != "image" {
		t.Fatalf("on-disk content = %q, err %v", b, err)
	}
	objs, err := p.list(ctx, "7")
	if err != nil || len(objs) != 1 || objs[0].Name != "photo.png" {
		t.Fatalf("list = %+v, err %v", objs, err)
	}
	if err := p.delete(ctx, "7/photo.png"); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "7", "photo.png")); !os.IsNotExist(err) {
		t.Fatalf("file still exists after delete: %v", err)
	}
}
