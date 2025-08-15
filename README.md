# Little Moments - Offline (Self Hosted)
A privacy first, self hosted photo sharing app. This aims to have a 1:1 experience between this repo and the Cloud based Little Moments project that I created. This is a great and simple solution for homelabers that want a way to share photos while being able to control where the data is stored and who is able to access it.

## The Why
### For you
- Own your data: We fall into the habit of trusting third party cloud providers with our sensative information. This is especially true with photos. 
- Your data is persistent: You are the only one responsible for your photos. No matter what happens to AWS, GCP, or Azure, you will always have your little moments safe.

### For me
- This is my journey: For years I've wanted to create something beautiful that really sucked me in and ignited the fire I knew I've always had. This project, both the cloud, and now this offline version, has helped me grow as developer tremendously. This is my capstone, and hopefully the project that finally lands me a job in dev after 6 years of trying (sometimes off and on)

## Tech Stack
- Backend: Go
- Frontend: React
- Database: SQLite
- Object Storage: MinIO (S3-Compatible)
- Auth: OAuth2 proxy + Authentik
- Containerization: Docker