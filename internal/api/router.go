package api

import (
	"net/http"
)

func routerHandler(http.Handler) {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", healthzHandler)
}
