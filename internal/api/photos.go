package api

import (
	"encoding/json"
	"mime"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/AJMerr/little-moments-offline/internal/storage"
	"github.com/google/uuid"
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
