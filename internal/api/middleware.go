package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"runtime/debug"
	"strconv"
	"strings"
	"time"
)

// X-Request-ID middleware
// Gets or generates an X-Request-ID and returns to the HTTP header
// Struct for reqIDKey to prevent it from being overwritten
type requestIDKey struct{}

// Function for creating a new request ID as a hex string
func newReqID() string {
	buf := make([]byte, 16)

	if _, err := rand.Read(buf); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}
	return hex.EncodeToString(buf)
}

// Function to store the request ID in ctx
func storeReqID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, requestIDKey{}, id)
}

// reqIDFromCtx retrieves id from ctx
func reqIDFromCtx(ctx context.Context) (string, bool) {
	v := ctx.Value(requestIDKey{})
	s, ok := v.(string)
	return s, ok
}

// reqID ensures every request has an ID:
// - uses incoming X-Request-ID if present
// - otherwise generates one
// - sets the response header so clients can see it
func reqID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Read the incoming header
		id := r.Header.Get("X-Request-ID")

		// Checks the length of the ID and generates a new req ID if the length is greater than 128
		if len(strings.TrimSpace(id)) == 0 || len(id) > 128 {
			id = newReqID()
		}

		// Make it visible to the client and downstream middleware/handlers
		w.Header().Set("X-Request-ID", id)
		r = r.WithContext(storeReqID(r.Context(), id))

		next.ServeHTTP(w, r)
	})
}

// Logger middleware
// Struct for http response metadata
type resMeta struct {
	http.ResponseWriter
	status int
	bytes  int
}

// Captues the status code and sends the final status code to the ResponseWriter
func (rw *resMeta) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}

// Counts the number of bytes in a response.
func (rw *resMeta) Write(p []byte) (int, error) {
	n, err := rw.ResponseWriter.Write(p)
	rw.bytes += n
	return n, err
}

// Logs data from rec and returns the data as JSON via os.Stdout when a request is made
func logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		wrapped := &resMeta{ResponseWriter: w, status: 200}
		next.ServeHTTP(wrapped, r)
		id, _ := reqIDFromCtx(r.Context())
		rec := map[string]any{
			"ts":         time.Now().Format(time.RFC3339Nano),
			"level":      "info",
			"request_id": id,
			"method":     r.Method,
			"path":       r.URL.Path,
			"status":     wrapped.status,
			"bytes":      wrapped.bytes,
			"latency_ms": time.Since(start).Milliseconds(),
			"remote_ip":  r.RemoteAddr,
			"user_agent": r.UserAgent(),
		}
		_ = json.NewEncoder(os.Stdout).Encode(rec)
	})
}

// Panic recovery
// This will return a JSON log with a status of 500 as well as a stack trace
func panicRecovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				// Get ID from ctc
				id, _ := reqIDFromCtx(r.Context())

				// Logs errors in a single JSON line
				errRec := map[string]any{
					"level":      "error",
					"request_id": id,
					"panic":      fmt.Sprint(rec),
					"stack":      string(debug.Stack()),
					"method":     r.Method,
					"path":       r.URL.Path,
				}
				_ = json.NewEncoder(os.Stdout).Encode(errRec)

				// Returns an error resposne
				w.Header().Set("Content-Type", "application/json; charset-utf-8")
				w.WriteHeader(http.StatusInternalServerError)
				_ = json.NewEncoder(w).Encode(map[string]any{"error": "internal_server_error"})
			}
		}()

		next.ServeHTTP(w, r)
	})
}
