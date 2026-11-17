package handlers

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

// ETagMiddleware adds strong ETag/304 support to small, cacheable GET JSON
// responses. Skips SSE streams, uploads, and large bodies. Enable with
// ETAG_ENABLED=1 (default off — opt in at the edge).
// nginx/browser revalidation then turns repeated polling into 304s (no body).
func ETagMiddleware() gin.HandlerFunc {
	enabled := os.Getenv("ETAG_ENABLED") == "1"
	maxBytes := 2 << 20 // 2 MB
	if v, err := strconv.Atoi(os.Getenv("ETAG_MAX_BYTES")); err == nil && v > 0 {
		maxBytes = v
	}
	return func(c *gin.Context) {
		if !enabled || c.Request.Method != http.MethodGet || skipETagPath(c.Request.URL.Path) {
			c.Next()
			return
		}
		bw := &etagBuffer{ResponseWriter: c.Writer, status: http.StatusOK}
		c.Writer = bw
		c.Next()

		body := bw.buf.Bytes()
		if bw.status != http.StatusOK || len(body) == 0 || len(body) > maxBytes ||
			strings.HasPrefix(c.Writer.Header().Get("Content-Type"), "text/event-stream") {
			bw.flush()
			return
		}
		sum := sha256.Sum256(body)
		etag := `"` + hex.EncodeToString(sum[:8]) + `"`
		c.Header("ETag", etag)
		c.Header("Cache-Control", "private, max-age=0, must-revalidate")
		if inm := c.GetHeader("If-None-Match"); inm != "" {
			for _, candidate := range strings.Split(inm, ",") {
				if strings.TrimSpace(candidate) == etag || strings.TrimSpace(candidate) == "*" {
					// Write the 304 straight to the real writer — the buffered
					// writer suppresses WriteHeader until flush(), so using
					// c.Status() here would leave the real writer untouched and
					// net/http would default to an empty 200.
					c.Header("ETag", etag)
					bw.ResponseWriter.WriteHeader(http.StatusNotModified)
					return // no body for 304
				}
			}
		}
		bw.flush()
	}
}

func skipETagPath(path string) bool {
	return strings.Contains(path, "/stream") ||
		strings.HasPrefix(path, "/uploads") ||
		strings.HasPrefix(path, "/metrics") ||
		strings.HasPrefix(path, "/admin/events")
}

// etagBuffer buffers the response so we can hash it before sending. It
// implements gin.ResponseWriter by embedding and overriding the methods that
// write, so gin's rendering calls land in the buffer.
type etagBuffer struct {
	gin.ResponseWriter
	buf         bytes.Buffer
	status      int
	wroteHeader bool
}

func (w *etagBuffer) WriteHeader(code int) {
	if !w.wroteHeader {
		w.status = code
		w.wroteHeader = true
	}
}
func (w *etagBuffer) WriteHeaderNow() {} // suppress premature commit
func (w *etagBuffer) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.buf.Write(b)
}
func (w *etagBuffer) WriteString(s string) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.buf.WriteString(s)
}
func (w *etagBuffer) Status() int  { return w.status }
func (w *etagBuffer) Written() bool { return w.wroteHeader }
func (w *etagBuffer) Size() int     { return w.buf.Len() }
func (w *etagBuffer) Flush()        {} // no-op while buffering
func (w *etagBuffer) flush() {
	w.ResponseWriter.WriteHeader(w.status)
	if w.status != http.StatusNotModified {
		_, _ = w.ResponseWriter.Write(w.buf.Bytes())
	}
}
