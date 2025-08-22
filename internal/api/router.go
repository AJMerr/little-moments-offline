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
	mux.HandleFunc("GET /photos/{id}", GetPhotoByID(gdb))
	mux.HandleFunc("GET /photos/{id}/url", GetPhotoUrl(gdb, s3))
	mux.HandleFunc("GET /albums", GetAllAlbums(gdb))
	mux.HandleFunc("GET /albums/{id}", GetAlbumByID(gdb))
	mux.HandleFunc("DELETE /photos/{id}", DeletePhotoByID(gdb, s3))
	mux.HandleFunc("DELETE /albums/{id}", DeleteAlbum(gdb))
	mux.HandleFunc("DELETE /albums/{id}/photos", DeletePhotoFromAlbum(gdb))
	mux.HandleFunc("POST /photos/presign", PresignPhoto(s3))
	mux.HandleFunc("POST /photos/confirm", ConfirmPhoto(gdb, s3))
	mux.HandleFunc("POST /albums", CreateAblum(gdb))
	mux.HandleFunc("POST /albums/{id}/photos", AddPhotoToAlbum(gdb))
	mux.HandleFunc("PATCH /photos/{id}", UpdatePhoto(gdb))
	mux.HandleFunc("PATCH /albums/{id}", UpdateAlbum(gdb))
	return reqID(logger(panicRecovery(cors(mux))))
}
