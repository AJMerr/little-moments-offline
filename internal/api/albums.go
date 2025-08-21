package api

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
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

// Sets up GET requests with simple cursor helpers
const localuser = "local_user" // DELETE, use auth user later

type albumCursor struct {
	CreatedAt time.Time `json:"created_at"`
	ID        string    `json:"id"`
}

func encodeAlbumCursor(t time.Time, id string) string {
	b, _ := json.Marshal(albumCursor{CreatedAt: t, ID: id})
	return base64.RawURLEncoding.EncodeToString(b)
}

func decodeAlbumCursor(s string) (albumCursor, error) {
	var c albumCursor
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return c, err
	}
	err = json.Unmarshal(b, &c)
	return c, err
}

type albumPhotoCursor struct {
	AddedAt time.Time `json:"added_at"`
	PhotoID string    `json:"photo_id"`
}

func encodeAlbumPhotoCursor(t time.Time, pid string) string {
	b, _ := json.Marshal(albumPhotoCursor{AddedAt: t, PhotoID: pid})
	return base64.RawURLEncoding.EncodeToString(b)
}

func decodeAlbumPhotoCursor(s string) (albumPhotoCursor, error) {
	var c albumPhotoCursor
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return c, err
	}
	err = json.Unmarshal(b, &c)
	return c, err
}

// out models
type albumOut struct {
	ID           string    `json:"id"`
	Title        string    `json:"title"`
	Description  string    `json:"description"`
	CoverPhotoID *string   `json:"cover_photo_id"`
	CreatedAt    time.Time `json:"created_at"`
}

type photoOut struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	OriginKey   string    `json:"origin_key"`
	ContentType string    `json:"content_type"`
	Bytes       int64     `json:"bytes"`
	CreatedAt   time.Time `json:"created_at"`
}

// Function to GET all albums
func GetAllAlbums(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		limit := 25
		if s := r.URL.Query().Get("limit"); s != "" {
			if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 100 {
				limit = n
			}
		}
		var after *albumCursor
		if c := r.URL.Query().Get("cursor"); c != "" {
			ac, err := decodeAlbumCursor(c)
			if err != nil {
				writeError(w, http.StatusBadRequest, "bad_cursor")
				return
			}
			after = &ac
		}

		ctx := r.Context()
		var rows []db.Album
		q := gdb.WithContext(ctx).
			Where("owner_id = ? AND deleted_at IS NULL", localuser).
			Order("created_at DESC, id DESC")

		if after != nil {
			q = q.Where(
				`created_at < ? OR (created_at = ? AND id < ?)`,
				after.CreatedAt, after.CreatedAt, after.ID,
			)
		}

		q = q.Limit(limit).Find(&rows)
		if q.Error != nil {
			writeError(w, http.StatusInternalServerError, "db_lookup_failed")
			return
		}

		out := make([]albumOut, 0, len(rows))
		for _, a := range rows {
			out = append(out, albumOut{
				ID:           a.ID,
				Title:        a.Title,
				Description:  a.Description,
				CoverPhotoID: a.CoverPhotoID,
				CreatedAt:    a.CreatedAt,
			})
		}

		next := ""
		if len(rows) == limit {
			last := rows[len(rows)-1]
			next = encodeAlbumCursor(last.CreatedAt, last.ID)
		}

		toJSON(w, http.StatusOK, map[string]any{
			"items":       out,
			"next_cursor": next,
		})
	}
}

// Helper function to get the path ID
func pathID(r *http.Request, prefix string) (string, bool) {
	// expects paths like /albums/{id}
	if !strings.HasPrefix(r.URL.Path, prefix) {
		return "", false
	}
	id := strings.TrimPrefix(r.URL.Path, prefix)
	// reject nested paths: /albums/{id}/something
	if id == "" || strings.Contains(id, "/") {
		return "", false
	}
	return id, true
}

// GET album by ID
func GetAlbumByID(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", http.MethodGet)
			writeError(w, http.StatusMethodNotAllowed, "method_not_allowed")
			return
		}

		// Extract {id} from /albums/{id}
		id, ok := pathID(r, "/albums/")
		if !ok {
			writeError(w, http.StatusBadRequest, "bad_path")
			return
		}

		ctx := r.Context()

		// Load album meta
		var a db.Album
		if err := gdb.WithContext(ctx).Where(
			"id = ? AND owner_id = ? AND deleted_at IS NULL", id, localuser,
		).First(&a).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				writeError(w, http.StatusBadRequest, "album_not_found")
				return
			}
			writeError(w, http.StatusInternalServerError, "db_load_failed")
			return
		}

		// Pagination params for photos
		limit := 24
		if s := r.URL.Query().Get("limit"); s != "" {
			if n, err := strconv.Atoi(s); err == nil && n > 0 && n <= 100 {
				limit = n
			}
		}

		var after *albumPhotoCursor
		if c := r.URL.Query().Get("cursor"); c != "" {
			pc, err := decodeAlbumPhotoCursor(c)
			if err != nil {
				writeError(w, http.StatusBadRequest, "bad_cursor")
				return
			}
			after = &pc
		}

		// Join album_photos to photos, ordered by added_at then photo id (desc)
		type row struct {
			db.Photo
			AddedAt time.Time
		}
		var rows []row

		q := gdb.WithContext(ctx).
			Table("album_photos ap").
			Select("p.*, ap.added_at").
			Joins("JOIN photos p ON p.id = ap.photo_id").
			Where("ap.album_id = ? AND p.deleted_at IS NULL", id).
			Order("ap.added_at DESC, p.id DESC")

		if after != nil {
			q = q.Where(`
				ap.added_at < ? OR (ap.added_at = ? AND p.id < ?)`,
				after.AddedAt, after.AddedAt, after.PhotoID,
			)
		}

		if err := q.Limit(limit).Scan(&rows).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "db_list_failed")
			return
		}

		photos := make([]photoOut, 0, len(rows))
		for _, r := range rows {
			photos = append(photos, photoOut{
				ID:          r.Photo.ID,
				Title:       r.Photo.Title,
				Description: r.Photo.Description,
				OriginKey:   r.Photo.OriginKey,
				ContentType: r.Photo.ContentType,
				Bytes:       r.Photo.Bytes,
				CreatedAt:   r.Photo.CreatedAt,
			})
		}

		next := ""
		if len(rows) == limit {
			last := rows[len(rows)-1]
			next = encodeAlbumPhotoCursor(last.AddedAt, last.Photo.ID)
		}

		toJSON(w, http.StatusOK, map[string]any{
			"id":             a.ID,
			"title":          a.Title,
			"description":    a.Description,
			"cover_photo_id": a.CoverPhotoID,
			"created_at":     a.CreatedAt,
			"photos":         photos,
			"next_cursor":    next,
		})
	}
}
