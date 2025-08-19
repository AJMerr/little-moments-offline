package api

import (
	"net/http"
	"strconv"
	"time"

	db "github.com/AJMerr/little-moments-offline/internal/db"
	"github.com/AJMerr/little-moments-offline/internal/storage"
	"gorm.io/gorm"
)

func GetPhotoUrl(gdb *gorm.DB, s3 *storage.S3) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")

		// Photo Lookup
		var p db.Photo
		if err := gdb.WithContext(r.Context()).
			Where("id = ? AND owner_id = ?", id, "local_user"). // DELETE LATER will use Auth
			First(&p).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				writeError(w, http.StatusNotFound, "not_found")
				return
			}
			writeError(w, http.StatusInternalServerError, "db_lookup_failed")
			return
		}

		_ = r.URL.Query().Get("variant") //
		key := p.OriginKey

		// TTL
		ttl := 5 * time.Minute
		if raw := r.URL.Query().Get("ttl"); raw != "" {
			if secs, err := strconv.Atoi(raw); err == nil {
				if secs < 10 {
					secs = 10
				}
				if secs > 3000 {
					secs = 3000
				}
				ttl = time.Duration(secs) * time.Second
			}
		}

		url, err := s3.PresignGetObject(r.Context(), s3.Config.BucketPhotos, key, ttl)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "presign_failed")
			return
		}

		toJSON(w, http.StatusOK, map[string]any{
			"url":        url,
			"expires_at": time.Now().Add(ttl).UTC(),
		})
	}
}
