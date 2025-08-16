package api

import (
	"encoding/json"
	"fmt"
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

func versionHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")

	verionNumber := struct {
		Version string `json:"version"`
	}{
		Version: "0.0.1",
	}

	err := json.NewEncoder(w).Encode(verionNumber)
	if err != nil {
		fmt.Fprintf(w, "Failed to get version number")
	}
}
