package api

import (
	"net/http"

	"github.com/AJMerr/little-moments-offline/internal/storage"
)

func RouterHandler(s3 *storage.S3) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", healthzHandler)
	mux.HandleFunc("GET /version", versionHandler)
	mux.HandleFunc("GET /panic", func(w http.ResponseWriter, r *http.Request) { panic("AAAAAAHHH BEES") })
	mux.HandleFunc("POST /photos/presign", PresignPhoto(s3))
	return reqID(logger(panicRecovery(mux)))
}
