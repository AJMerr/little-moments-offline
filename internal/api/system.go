package api

import (
	"encoding/json"
	"net/http"
)

func healthzHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	status := struct {
		OK bool `json:"ok"`
	}{
		OK: true,
	}

	err := json.NewEncoder(w).Encode(status)
	if err != nil {
		http.Error(w, `{ok: false}`, http.StatusInternalServerError)
	}
}
