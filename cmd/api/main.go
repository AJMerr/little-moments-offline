package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/AJMerr/little-moments-offline/internal/api"
	db "github.com/AJMerr/little-moments-offline/internal/db"
	"github.com/AJMerr/little-moments-offline/internal/storage"
	"github.com/joho/godotenv"
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

	// Loads .env
	_ = godotenv.Load()

	// Sets up MinIO config
	s3Config := storage.S3Config{
		Endpoint:       os.Getenv("LM_S3_ENDPOINT"),
		Region:         os.Getenv("LM_S3_REGION"),
		AccessKey:      os.Getenv("LM_S3_ACCESS_KEY"),
		SecretKey:      os.Getenv("LM_S3_SECRET_KEY"),
		ForcePathStyle: true,
		BucketPhotos:   os.Getenv("LM_S3_BUCKET_PHOTOS"),
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Starts MinIO Client
	s3c, s3Err := storage.NewS3Client(ctx, s3Config)
	if s3Err != nil {
		log.Fatal("s3 client:", s3Err)
	}

	// Health check for bucket
	if s3Err := s3c.Health(ctx); s3Err != nil {
		log.Printf("WARN (%s): %v", s3Config.BucketPhotos, s3Err)
	}

	// Ensures bucket exists
	if bucketErr := s3c.EnsureBucket(ctx, os.Getenv("LM_S3_BUCKET_PHOTOS")); bucketErr != nil {
		log.Fatalf("ensure bucket %v", bucketErr)
	}

	_ = s3c.SetBucketCORS(ctx, os.Getenv("LM_S3_BUCKET_PHOTOS"))

	// Sets a var for the Router
	router := api.RouterHandler(gdb, s3c)

	fmt.Println("Server starting on 127.0.0.1:8173")
	err := http.ListenAndServe(":8173", router)
	if err != nil {
		log.Fatalf("Server failed to start %v", err)
	}
}
