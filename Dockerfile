#--- Build Stage ---
FROM golang:1.24.6 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/api ./cmd/api

#---Runtime Stage---
FROM gcr.io/distroless/static:nonroot
WORKDIR /app
COPY --from=build /out/api /app/api
USER nonroot:nonroot
VOLUME [ "/app/data" ]
EXPOSE 8173
ENTRYPOINT ["/app/api"]