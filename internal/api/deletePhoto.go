package api

import (
	"net/http"

	db "github.com/AJMerr/little-moments-offline/internal/db"
	"github.com/AJMerr/little-moments-offline/internal/storage"
	"gorm.io/gorm"
)

func DeletePhotoByID(gdb *gorm.DB, s3 *storage.S3) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")

		var p db.Photo
		if err := gdb.WithContext(r.Context()).
			Where("id = ? AND owner_id = ?", id, "local_user"). // DELETE Later, using auth user
			First(&p).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			writeError(w, http.StatusInternalServerError, "db_lookup_failed")
			return
		}

		// Soft delete
		if err := gdb.WithContext(r.Context()).Delete(&p).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "db_delete_failed")
			return
		}

		if err := s3.DeleteObject(r.Context(), s3.Config.BucketPhotos, p.OriginKey); err != nil {
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
