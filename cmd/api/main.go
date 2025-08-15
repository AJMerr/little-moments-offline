package main

import (
	"fmt"
	"log"
	"net/http"
)

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, "This is a test")
	})

	fmt.Println("Now listening on 127.0.0.1:8173")
	log.Fatal(http.ListenAndServe(":8173", nil))
}
