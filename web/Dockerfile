# --- build the web app ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

# --- serve with caddy ---
FROM caddy:2-alpine
# static site
COPY --from=build /app/dist /srv
# Caddy config for SPA + API proxy
COPY Caddyfile /etc/caddy/Caddyfile
