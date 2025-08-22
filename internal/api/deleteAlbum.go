package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/AJMerr/little-moments-offline/internal/db"
	"gorm.io/gorm"
)

type removePhotosReq struct {
	PhotoIDs []string `json:"photo_ids"`
}

// Helper function to resolve the path
// accepts /albums/{id}/photos (with or without a trailing slash)
func pathAlbumPhotos(r *http.Request) (string, bool) {
	p := strings.TrimSuffix(r.URL.Path, "/")
	if !strings.HasPrefix(p, "/albums/") || !strings.HasSuffix(p, "/photos") {
		return "", false
	}
	rest := strings.TrimPrefix(p, "/albums/")
	// rest should be "{id}/photos"
	parts := strings.Split(rest, "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] != "photos" {
		return "", false
	}
	return parts[0], true // {id}
}

// Deletes photos from an album
func DeletePhotoFromAlbum(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			w.Header().Set("Allow", http.MethodDelete)
			writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}
		id, ok := pathAlbumPhotos(r)
		if !ok {
			writeError(w, http.StatusBadRequest, "bad_path")
			return
		}

		var req removePhotosReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "bad_json")
			return
		}
		if len(req.PhotoIDs) == 0 {
			toJSON(w, http.StatusOK, map[string]any{"removed": 0})
			return
		}

		if err := gdb.Table("album_photos").
			Where("album_id = ? AND photo_id IN ?", id, req.PhotoIDs).
			Delete(nil).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "db_delete_failed")
			return
		}
		toJSON(w, http.StatusOK, map[string]any{"removed": len(req.PhotoIDs)})
	}
}

// Deletes an album
func DeleteAlbum(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodDelete {
			w.Header().Set("Allow", http.MethodDelete)
			writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
		}
		id, ok := pathID(r, "/albums/")
		if !ok {
			writeError(w, http.StatusBadRequest, "bad_path")
			return
		}
		if err := gdb.Model(&db.Album{}).
			Where("id = ? AND owner_id = ? AND deleted_at IS NULL", id, localuser).
			Updates(map[string]any{"deleted_at": time.Now(), "cover_photo_id": nil}).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "db_delete_failed")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
