package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/AJMerr/little-moments-offline/internal/db"
)

type createAlbumReq struct {
	Title        string   `json:"title"`
	Description  string   `json:"description,omitempty"`
	CoverPhotoID *string  `json:"cover_photo_id,omitempty"`
	PhotoIDs     []string `json:"photo_ids,omitempty"`
}

type albumRes struct {
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	Description  string  `json:"description"`
	CoverPhotoID *string `json:"cover_photo_id"`
	CreatedAt    string  `json:"created_at"`
}

// Creates albums
func CreateAblum(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in createAlbumReq
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			writeError(w, http.StatusBadRequest, "bad_request")
			return
		}

		in.Title = strings.TrimSpace(in.Title)
		in.Description = strings.TrimSpace(in.Description)
		if in.Title == "" {
			writeError(w, http.StatusBadRequest, "missing_title")
			return
		}

		const owner = "local_user" // DELETE LATER for auth user
		now := time.Now().UTC()

		var created db.Album
		if err := gdb.WithContext(r.Context()).Transaction(func(tx *gorm.DB) error {
			a := db.Album{
				ID:           uuid.NewString(),
				OwnerID:      owner,
				Title:        in.Title,
				Description:  in.Description,
				CoverPhotoID: in.CoverPhotoID,
				CreatedAt:    now,
				UpdatedAt:    now,
			}
			if err := tx.Create(&a).Error; err != nil {
				return err
			}

			// Validate photo exists
			if len(in.PhotoIDs) > 0 {
				var count int64
				if err := tx.Model(&db.Photo{}).
					Where("id IN ? AND owner_id = ? AND deleted_at IS NULL", in.PhotoIDs, owner).
					Count(&count).Error; err != nil {
					return err
				}
				if int(count) != len(in.PhotoIDs) {
					return fmt.Errorf("photo_not_found")
				}

				rows := make([]db.AlbumPhoto, 0, len(in.PhotoIDs))
				for i, pid := range in.PhotoIDs {
					rows = append(rows, db.AlbumPhoto{
						AlbumID: a.ID,
						PhotoID: pid,
						Pos:     i,
						AddedAt: now,
					})
				}
				if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&rows).Error; err != nil {
					return err
				}

				if a.CoverPhotoID == nil {
					a.CoverPhotoID = &in.PhotoIDs[0]
				}
			}

			if err := tx.Model(&db.Album{}).
				Where("id = ?", a.ID).
				Updates(map[string]any{
					"cover_photo_id": a.CoverPhotoID,
					"updated_at":     a.UpdatedAt,
				}).Error; err != nil {
				return err
			}

			created = a
			return nil
		}); err != nil {
			switch {
			case errors.Is(err, gorm.ErrInvalidData):
				writeError(w, http.StatusBadRequest, "bad_request")
			default:
				if strings.Contains(err.Error(), "photo_not_found") {
					writeError(w, http.StatusBadRequest, "photo_not_found")
				} else {
					writeError(w, http.StatusInternalServerError, "db_lookup_failed")
				}
			}
			return
		}

		toJSON(w, http.StatusCreated, albumRes{
			ID:           created.ID,
			Title:        created.Title,
			Description:  created.Description,
			CoverPhotoID: created.CoverPhotoID,
			CreatedAt:    created.CreatedAt.Format(time.RFC3339),
		})
	}
}
