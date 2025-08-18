package api

import (
	"encoding/json"
	"mime"
	"net/http"
	"path/filepath"
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
	Key         string `json:"string"`
	Bytes       int64  `json:"bytes"`
	ContentType string `json:"content-type"`
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
			tx := gdb.WithContext(r.Context()).First(&existingKey, "original_key  = ?", in.Key)
			if tx.Error == nil {
				toJSON(w, http.StatusOK, map[string]any{
					"id": existingKey.ID, "original_key": existingKey.OriginKey,
					"bytes": existingKey.Bytes, "content_type": existingKey.ContentType,
					"created_at": existingKey.CreatedAt,
				})
				return
			}
			writeError(w, http.StatusInternalServerError, "db_insert_failed")
			return
		}
		toJSON(w, http.StatusCreated, map[string]any{
			"id": photo.ID, "original_key": photo.OriginKey,
			"bytes": photo.Bytes, "content_type": photo.ContentType,
			"created_at": photo.CreatedAt,
		})
	}
}
