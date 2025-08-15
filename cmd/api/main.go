package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/AJMerr/little-moments-offline/internal/api"
)

func main() {
	// Sets a var for the Router
	router := api.RouterHandler()

	fmt.Println("Server starting on 127.0.0.1:8173")
	err := http.ListenAndServe("127.0.0.1:8173", router)
	if err != nil {
		log.Fatalf("Server failed to start %v", err)
	}
}
