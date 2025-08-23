# Little Moments - Offline (Self Hosted)
A privacy first, self hosted photo sharing app. This aims to have a 1:1 experience between this repo and the Cloud based Little Moments project that I created. This is a great and simple solution for homelabers that want a way to share photos while being able to control where the data is stored and who is able to access it.

**Backend:** Go + SQLite + MinIO (S3-compatible blob storage)  
**Frontend:** React + Vite + Tailwind, served by Caddy  
**Packaged:** Docker Compose

-  Upload with **presigned PUT** → confirm to persist metadata
-  Cursor-based listing (stable pagination)
-  Edit (title/description), delete, and view via **presigned GET**
-  Local-first—SQLite + MinIO volumes on your machine

## The Why
### For you
- Own your data: We fall into the habit of trusting third party cloud providers with our sensative information. This is especially true with photos. 
- Your data is persistent: You are the only one responsible for your photos. No matter what happens to AWS, GCP, or Azure, you will always have your little moments safe.

### For me
- This is my journey: For years I've wanted to create something beautiful that really sucked me in and ignited the fire I knew I've always had. This project, both the cloud, and now this offline version, has helped me grow as developer tremendously. This is my capstone, and hopefully the project that finally lands me a job in dev after 6 years of trying (sometimes off and on)

## Quick Start (Docker)

```bash
# 1) Clone
git clone https://github.com/<you>/little-moments-offline.git
cd little-moments-offline

# 2) Create env files from examples
cp .env.example .env
cp web/.env.example web/.env

# 3) Build & run
docker compose up -d --build

# 4) Open the app
open http://localhost:8080
# or (add to /etc/hosts: 127.0.0.1 littlemoments)
open http://littlemoments:8080
```

### What's Running?
- web - Caddy servers the front end and proxies:
    - ```/api/*``` -> Go API
    - ```/s3/*``` -> MinIO (same-origin uploads/downloads, no CORS pain)
- api - Go server (SQLite metadata, S3 client)
- minio - S3 compatible + console

### Ports
- App UI ```http://localhost:8080``` 
- API (direct) ```http://localhost:8173```
- MinIO Console: ```http://localhost:9001``` (use env credentials)

## Environment Variables
| Var                   | Required | Example                 | Notes                                      |
| --------------------- | -------- | ----------------------- | ------------------------------------------ |
| `MINIO_ROOT_USER`     | ✅        | `miniadmin`             | MinIO access key                           |
| `MINIO_ROOT_PASSWORD` | ✅        | `change_me_please`      | MinIO secret (quote values containing `$`) |
| `LM_S3_BUCKET_PHOTOS` | ✅        | `photos`                | Auto-created on boot                       |
| `LM_S3_REGION`        | ✅        | `us-east-1`             | Arbitrary region string                    |
| `LM_S3_PUBLIC_BASE`   | ✅        | `http://localhost:9000` | For diagnostics; SDK signs URLs            |
| `LM_WEB_ORIGINS`      | ✅        | `http://localhost:8080` | CSV list for CORS                          |

### web/ Environment Variable
| Var             | Required | Example | Notes                                |
| --------------- | -------- | ------- | ------------------------------------ |
| `VITE_API_BASE` | ✅        | `/api`  | Caddy proxies `/api` → API container |

## Upload flow
Uploads are a multi-step process as presigned URLs are used for improved security

1. Presign via API
```bash
POST /api/photos/presign
{ "filename": "banana.jpg", "content_type": "image/jpeg" }

→ {
     "url": "<presigned PUT>",
     "key": "<object-key>",
     "headers": { "Content-Type": "image/jpeg" }
   }
```

2. Upload to same origin (browser → /s3/... → MinIO) and confirm:
```bash
POST /api/photos/confirm
{
  "key": "<object-key>",
  "bytes": 21702,
  "content_type": "image/jpeg",
  "title": "Banana"
}
```

## API Overview
### Photos API
Base Path: /api

| Method | Path               | Purpose                                                              |
| -----: | ------------------ | -------------------------------------------------------------------- |
|    GET | `/photos`          | List photos (cursor pagination)                                      |
|    GET | `/photos/{id}`     | Get photo metadata by id                                             |
|    GET | `/photos/{id}/url` | Get a presigned **GET** URL to display the image (`ttl` seconds)     |
|   POST | `/photos/presign`  | Get a presigned **PUT** URL to upload a new object                   |
|   POST | `/photos/confirm`  | Confirm uploaded object; create (or return existing) DB metadata row |
|  PATCH | `/photos/{id}`     | Update title/description                                             |
| DELETE | `/photos/{id}`     | Delete photo (DB row and backing object)                             |


### Albums API
| Method | Path                  | Purpose                         |
| -----: | --------------------- | ------------------------------- |
|   POST | `/albums`             | Create album                    |
|    GET | `/albums`             | List albums (cursor pagination) |
|    GET | `/albums/{id}`        | Get album (with paged photos)   |
|  PATCH | `/albums/{id}`        | Update title/description/cover  |
| DELETE | `/albums/{id}`        | Delete album (soft delete)      |
|   POST | `/albums/{id}/photos` | Add photos to album             |
| DELETE | `/albums/{id}/photos` | Remove photos from album        |


## Thanks
- MinIO team for an awesome alternative solution to S3
- Vite, Tailwind, and React maintainers
- You, for giving this project a look