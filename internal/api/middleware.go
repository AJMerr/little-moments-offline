package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Creating a struct for reqIDKey to prevent it from being overwritten
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

// requestID ensures every request has an ID:
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

		// continue the chain
		next.ServeHTTP(w, r)
	})
}
