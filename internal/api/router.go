package api

import (
	"net/http"
)

func RouterHandler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", healthzHandler)
	mux.HandleFunc("GET /version", versionHandler)
	return mux
}
