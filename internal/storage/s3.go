package storage

import (
	"context"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
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

func (s *S3) Head(ctx context.Context, bucket, key string) (*s3.HeadObjectOutput, error) {
	return s.raw.HeadObject(ctx, &s3.HeadObjectInput{Bucket: &bucket, Key: &key})
}
