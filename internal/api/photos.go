package api

import (
	"encoding/base64"
	"encoding/json"
	"mime"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	db "github.com/AJMerr/little-moments-offline/internal/db"
	"github.com/AJMerr/little-moments-offline/internal/storage"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type presignReq struct {
	Filename    string `json:"filename"`
	ContentType string `json:"content_type"`
}

type presignRes struct {
	URL     string            `json:"url"`
	Key     string            `json:"key"`
	Headers map[string]string `json:"headers"`
}

// Presign handler to close over the MinIO client
func PresignPhoto(s3 *storage.S3) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in presignReq
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			writeError(w, http.StatusBadRequest, "bad_request")
			return
		}

		// Sanitizes filename
		in.Filename = filepath.Clean(filepath.Base(strings.TrimSpace(in.Filename)))
		content := strings.TrimSpace(in.ContentType)
		if content == "" && in.Filename != "" {
			if extension := strings.ToLower(filepath.Ext(in.Filename)); extension != "" {
				if guess := mime.TypeByExtension(extension); guess != "" {
					content = guess
				}
			}
		}
		if content == "" {
			writeError(w, http.StatusBadRequest, "content_type_required")
			return
		}

		// UUID
		id := uuid.NewString()
		extension := strings.ToLower(filepath.Ext(in.Filename))
		key := id + extension

		url, headers, err := s3.PresignPut(r.Context(), s3.Config.BucketPhotos, key, content, 10*time.Minute)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "presign_failed")
			return
		}

		toJSON(w, http.StatusOK, presignRes{
			URL:     url,
			Key:     key,
			Headers: headers,
		})
	}
}

type confirmReq struct {
	Key         string `json:"key"`
	Bytes       int64  `json:"bytes"`
	ContentType string `json:"content_type"`
	Title       string `json:"title,omitempty"`
	Description string `json:"description,omitempty"`
}

// Function to confirm that a photo exists in MinIO
func ConfirmPhoto(gdb *gorm.DB, s3 *storage.S3) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var in confirmReq
		if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
			writeError(w, http.StatusBadRequest, "bad_request")
			return
		}
		in.Key = strings.TrimSpace(in.Key)
		in.ContentType = strings.TrimSpace(in.ContentType)
		if in.Key == "" || in.ContentType == "" || in.Bytes < 0 {
			writeError(w, http.StatusBadRequest, "missing_fields")
			return
		}

		photo := db.Photo{
			ID:          uuid.NewString(),
			OwnerID:     "local_user", // TEMPORARY, WILL ADD AUTH USER
			Title:       in.Title,
			Description: in.Description,
			OriginKey:   in.Key,
			ContentType: in.ContentType,
			Bytes:       in.Bytes,
			CreatedAt:   time.Now(),
		}

		// Creates a row or returns existing key if it exists
		if err := gdb.WithContext(r.Context()).Create(&photo).Error; err != nil {
			// Tries to get existing key
			var existingKey db.Photo
			tx := gdb.WithContext(r.Context()).First(&existingKey, "origin_key = ?", in.Key)
			if tx.Error == nil {
				toJSON(w, http.StatusOK, map[string]any{
					"id": existingKey.ID, "origin_key": existingKey.OriginKey,
					"bytes": existingKey.Bytes, "content_type": existingKey.ContentType,
					"created_at": existingKey.CreatedAt,
				})
				return
			}
			writeError(w, http.StatusInternalServerError, "db_insert_failed")
			return
		}
		toJSON(w, http.StatusCreated, map[string]any{
			"id": photo.ID, "origin_key": photo.OriginKey,
			"bytes": photo.Bytes, "content_type": photo.ContentType,
			"created_at": photo.CreatedAt,
		})
	}
}

// Makes Created at + id base64 URL encoded
type cursorPayload struct {
	T  int64  `json:"t"`
	ID string `json:"id"`
}

func encodeCursor(t time.Time, id string) string {
	b, _ := json.Marshal(cursorPayload{T: t.UnixNano(), ID: id})
	return base64.RawURLEncoding.EncodeToString(b)
}

func decodeCursor(s string) (time.Time, string, error) {
	var p cursorPayload
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return time.Time{}, "", err
	}
	if err := json.Unmarshal(b, &p); err != nil {
		return time.Time{}, "", err
	}
	return time.Unix(0, p.T), p.ID, nil
}

type photoItem struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	OriginKey   string    `json:"origin_key"`
	ContentType string    `json:"content_type"`
	Bytes       int64     `json:"bytes"`
	CreatedAt   time.Time `json:"created_at"`
}

type listRes struct {
	Items      []photoItem `json:"items"`
	NextCursor string      `json:"next_cursor"`
}

// Function to GET all photos
func GetAllPhotos(gdb *gorm.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Limits to 25, clamp 1 - 100
		limit := 25
		if s := r.URL.Query().Get("limit"); s != "" {
			if n, err := strconv.Atoi(s); err == nil {
				if n < 1 {
					n = 1
				}
				if n > 100 {
					n = 100
				}
				limit = n
			}
		}

		// Base query
		q := gdb.WithContext(r.Context()).
			Where("owner_id = ?", "local_user"). // REMOVE: will be auth user
			Order("created_at DESC").
			Order("id DESC").
			Limit(limit)

		// If a cursor exists, connect it via WHERE
		if c := r.URL.Query().Get("curosr"); c != "" {
			t, lastID, err := decodeCursor(c)
			if err != nil {
				writeError(w, http.StatusBadRequest, "bad_cursor")
				return
			}
			// Get rows after the last item seen
			q = q.Where("(created_at < ?) OR (created_at = ? AND id < ?)", t, t, lastID)
		}

		// Runs query
		var rows []db.Photo
		if err := q.Find(&rows).Error; err != nil {
			writeError(w, http.StatusInternalServerError, "db_list_failed")
			return
		}

		// Maps DB rows to API
		items := make([]photoItem, 0, len(rows))
		for _, p := range rows {
			items = append(items, photoItem{
				ID:          p.ID,
				Title:       p.Title,
				Description: p.Description,
				OriginKey:   p.OriginKey,
				ContentType: p.ContentType,
				Bytes:       p.Bytes,
				CreatedAt:   p.CreatedAt,
			})
		}

		// Builds next cursor
		out := listRes{Items: items}
		if len(rows) == limit {
			last := rows[len(rows)-1]
			out.NextCursor = encodeCursor(last.CreatedAt, last.ID)
		}

		toJSON(w, http.StatusOK, out)
	}
}
