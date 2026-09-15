# Stage 1: Build
FROM node:20.19.0-alpine3.20@sha256:6e6c8c8f5d5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5 AS builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ .
ARG VITE_API_BASE_URL=""
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:1.27.1-alpine3.20@sha256:5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5
WORKDIR /usr/share/nginx/html
COPY --from=builder /app/dist .
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
USER nginx
CMD ["nginx", "-g", "daemon off;"]
