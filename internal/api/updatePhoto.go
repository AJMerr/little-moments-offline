package api

import (
	"encoding/json"
	"net/http"
	"strings"

	db "github.com/AJMerr/little-moments-offline/internal/db"
	"gorm.io/gorm"
)

func UpdatePhoto(gdb *gorm.DB) http.HandlerFunc {
	type patchReq struct {
		Title       *string `json:"title"`
		Description *string `json:"description"`
	}

	return func(w http.ResponseWriter, r *http.Request) {
		var in patchReq
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			writeError(w, http.StatusBadRequest, "bad_request")
			return
		}
		if in.Title == nil && in.Description == nil {
			writeError(w, http.StatusBadRequest, "missing_fields")
			return
		}

		updates := map[string]any{}

		if in.Title != nil {
			t := strings.TrimSpace(*in.Title)
			if len(t) > 100 {
				writeError(w, http.StatusBadRequest, "title_too_long")
				return
			}
			updates["title"] = t
		}

		if in.Description != nil {
			d := strings.TrimSpace(*in.Description)
			if len(d) > 2000 {
				writeError(w, http.StatusBadRequest, "description_too_long")
				return
			}
			updates["description"] = d
		}

		if len(updates) == 0 {
			writeError(w, http.StatusBadRequest, "no_update_made")
			return
		}

		id := r.PathValue("id")

		// Only update rows owned by current user
		tx := gdb.WithContext(r.Context()).
			Model(&db.Photo{}).
			Where("id = ? AND owner_id = ?", id, "local_user"). // DELETE THIS, switch to auth user
			Updates(updates)

		if tx.Error != nil {
			writeError(w, http.StatusInternalServerError, "db_lookup_failed")
			return
		}
		if tx.RowsAffected == 0 {
			writeError(w, http.StatusNotFound, "photo_not_found")
			return
		}

		// Returns updated metadata
		var out db.Photo
		if err := gdb.WithContext(r.Context()).
			Where("id = ? AND owner_id = ?", id, "local_user"). // YOU KNOW THE DRILL
			First(&out).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "db_lookup_failed")
			return
		}

		toJSON(w, http.StatusOK, map[string]any{
			"id":           out.ID,
			"title":        out.Title,
			"description":  out.Description,
			"origin_key":   out.OriginKey,
			"content_type": out.ContentType,
			"bytes":        out.Bytes,
			"created_at":   out.CreatedAt,
		})
	}
}
