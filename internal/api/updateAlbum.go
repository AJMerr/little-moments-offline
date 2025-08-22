package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/AJMerr/little-moments-offline/internal/db"
	"gorm.io/gorm"
)

type albumPatch = struct {
	Title        *string `json:"title"`
	Description  *string `json:"description"`
	CoverPhotoID *string `json:"cover_photo_id"`
}

func UpdateAlbum(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPatch {
			w.Header().Set("Allow", http.MethodPatch)
			writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}

		id, ok := pathID(r, "/albums/")
		if !ok {
			writeError(w, http.StatusBadRequest, "bad_path")
			return
		}

		var p albumPatch
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeError(w, http.StatusBadRequest, "bad_json")
			return
		}

		// Ensure album exists and belongs to user
		var a db.Album
		if err := gdb.Where("id = ? AND owner_id = ? AND deleted_at IS NULL", id, localuser).First(&a).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				writeError(w, http.StatusNotFound, "album_not_found")
			} else {
				writeError(w, http.StatusInternalServerError, "db_load_failed")
			}
			return
		}

		updates := map[string]any{}
		if p.Title != nil {
			updates["title"] = strings.TrimSpace(*p.Title)
		}
		if p.Description != nil {
			updates["description"] = *p.Description
		}
		if p.CoverPhotoID != nil {
			if *p.CoverPhotoID == "" {
				updates["cover_photo_id"] = nil
			} else {

				var count int64
				if err := gdb.Table("album_photos").
					Where("album_id = ? AND photo_id = ?", id, *p.CoverPhotoID).
					Count(&count).Error; err != nil {
					writeError(w, 500, "db_check_failed")
					return
				}
				if count == 0 {
					writeError(w, http.StatusBadRequest, "cover_not_in_album")
					return
				}
				updates["cover_photo_id"] = *p.CoverPhotoID
			}
		}

		if len(updates) > 0 {
			if err := gdb.Model(&db.Album{}).
				Where("id = ? AND owner_id = ?", id, localuser).
				Updates(updates).Error; err != nil {
				writeError(w, http.StatusInternalServerError, "db_update_failed")
				return
			}
		}

		// Return fresh album meta
		if err := gdb.Where("id = ?", id).First(&a).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "db_load_failed")
			return
		}
		toJSON(w, 200, albumOut{
			ID:           a.ID,
			Title:        a.Title,
			Description:  a.Description,
			CoverPhotoID: a.CoverPhotoID,
			CreatedAt:    a.CreatedAt,
		})
	}
}
