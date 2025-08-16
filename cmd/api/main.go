package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/AJMerr/little-moments-offline/internal/api"
	db "github.com/AJMerr/little-moments-offline/internal/db"
)

func main() {

	// DB Connection and migrate if needed
	gdb, dbErr := db.OpenDB("data/app.db")
	if dbErr != nil {
		log.Fatal(dbErr)
	}

	if dbErr := db.Migrate(gdb); dbErr != nil {
		log.Fatalf("migrate: %v", dbErr)
	}

	// Sets a var for the Router
	router := api.RouterHandler()

	fmt.Println("Server starting on 127.0.0.1:8173")
	err := http.ListenAndServe("127.0.0.1:8173", router)
	if err != nil {
		log.Fatalf("Server failed to start %v", err)
	}
}
