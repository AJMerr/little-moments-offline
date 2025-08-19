package storage

import (
	"context"
	"errors"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
)

type S3Config struct {
	Endpoint       string
	Region         string
	AccessKey      string
	SecretKey      string
	ForcePathStyle bool
	BucketPhotos   string
}

type S3 struct {
	raw     *s3.Client
	presign *s3.PresignClient
	Config  S3Config
}

func NewS3Client(ctx context.Context, c S3Config) (*S3, error) {
	// Sets up the configuration based on the S3Config struct
	cfg, err := awsconfig.LoadDefaultConfig(
		ctx,
		awsconfig.WithRegion(c.Region),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(c.AccessKey, c.SecretKey, ""),
		),
	)
	if err != nil {
		return nil, err
	}

	// Sets up the client to use the endpoint from S3Config and forces path style for MinIO
	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(c.Endpoint)
		o.UsePathStyle = c.ForcePathStyle
	})

	return &S3{
		raw:     client,
		presign: s3.NewPresignClient(client),
		Config:  c,
	}, nil
}

func (s *S3) Health(ctx context.Context) error {
	_, err := s.raw.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: &s.Config.BucketPhotos})
	return err
}

// Checks if a bucket exists, if not creates it
func (s *S3) EnsureBucket(ctx context.Context, bucket string) error {
	if bucket == "" {
		return nil
	}

	if _, err := s.raw.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: &bucket}); err == nil {
		return nil
	}

	// Creates bucket if bucket doesn't exist
	in := &s3.CreateBucketInput{Bucket: &bucket}
	if s.Config.Region != "" && s.Config.Region != "us-east-1" {
		in.CreateBucketConfiguration = &types.CreateBucketConfiguration{
			LocationConstraint: types.BucketLocationConstraint(s.Config.Region),
		}
	}

	_, err := s.raw.CreateBucket(ctx, in)
	if err == nil {
		return nil
	}

	// Treats already exists as success
	var ae smithy.APIError
	if errors.As(err, &ae) {
		code := ae.ErrorCode()
		if code == "BucketAlreadyOwnedByYou" || code == "BucketAlreadyExists" {
			return nil
		}
	}
	return err
}

// Sets bucket CORS
func (s *S3) SetBucketCORS(ctx context.Context, bucket string) error {
	if bucket == "" {
		return nil
	}
	cfg := &types.CORSConfiguration{
		CORSRules: []types.CORSRule{{
			AllowedMethods: []string{"GET, PUT"},
			AllowedHeaders: []string{""},
			AllowedOrigins: []string{""},
			ExposeHeaders:  []string{"ETag"},
			MaxAgeSeconds:  aws.Int32(3000),
		}},
	}
	_, err := s.raw.PutBucketCors(ctx, &s3.PutBucketCorsInput{
		Bucket:            &bucket,
		CORSConfiguration: cfg,
	})
	return err
}

func (s *S3) PresignPut(ctx context.Context, bucket, key, contentType string, expires time.Duration) (string, map[string]string, error) {
	out, err := s.presign.PresignPutObject(ctx, &s3.PutObjectInput{
		Bucket:      &bucket,
		Key:         &key,
		ContentType: &contentType,
	}, s3.WithPresignExpires(expires))
	if err != nil {
		return "", nil, err
	}
	return out.URL, map[string]string{"Content-Type": contentType}, nil
}

// Confirms an object exists in MinIO
func (s *S3) Head(ctx context.Context, bucket, key string) (*s3.HeadObjectOutput, error) {
	return s.raw.HeadObject(ctx, &s3.HeadObjectInput{Bucket: &bucket, Key: &key})
}

// Funtion returns a time limited URL to read an object
func (s *S3) PresignGetObject(ctx context.Context, bucket, key string, ttl time.Duration) (string, error) {
	p := s3.NewPresignClient(s.raw)
	out, err := p.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: &bucket,
		Key:    &key,
	}, func(o *s3.PresignOptions) { o.Expires = ttl })
	if err != nil {
		return "", err
	}
	return out.URL, nil
}

// Function to delete an object from storage
func (s *S3) DeleteObject(ctx context.Context, bucket, key string) error {
	_, err := s.raw.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: &bucket,
		Key:    &key,
	})
	return err
}
