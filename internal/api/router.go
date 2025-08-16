package api

import (
	"net/http"
)

func RouterHandler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", healthzHandler)
	mux.HandleFunc("GET /version", versionHandler)
	mux.HandleFunc("GET /panic", func(w http.ResponseWriter, r *http.Request) { panic("AAAAAAHHH BEES") })
	return reqID(logger(panicRecovery(mux)))
}
