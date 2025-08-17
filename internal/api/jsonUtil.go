package api

import (
	"encoding/json"
	"net/http"
)

// Function that sets the http response writer to json and sets the header
func toJSON(w http.ResponseWriter, code int, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		http.Error(w, `{"error":"encoding_failed"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_, _ = w.Write(b)
	_, _ = w.Write([]byte("\n"))
}

func writeError(w http.ResponseWriter, code int, message string) {
	toJSON(w, code, map[string]any{"error": message})
}
