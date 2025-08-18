package api

import (
	"net/http"

	"github.com/AJMerr/little-moments-offline/internal/storage"
	"gorm.io/gorm"
)

func RouterHandler(gdb *gorm.DB, s3 *storage.S3) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", healthzHandler)
	mux.HandleFunc("GET /version", versionHandler)
	mux.HandleFunc("GET /panic", func(w http.ResponseWriter, r *http.Request) { panic("AAAAAAHHH BEES") })
	mux.HandleFunc("GET /photos", GetAllPhotos(gdb))
	mux.HandleFunc("POST /photos/presign", PresignPhoto(s3))
	mux.HandleFunc("POST /photos/confirm", ConfirmPhoto(gdb, s3))
	return reqID(logger(panicRecovery(mux)))
}
