#--- Build Stage ---
FROM golang:1.24.6-alpine AS build
WORKDIR /app
RUN apk add --no-cache build-base
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o /bin/api ./cmd/api

#---Runtime Stage---
FROM alpine:3.20
RUN adduser -D -H -u 10001 app
RUN mkdir -p /app/data
WORKDIR /app
COPY --from=build /bin/api /usr/local/bin/api
EXPOSE 8173
USER app
CMD [ "api" ]