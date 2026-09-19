# Stage 1: Build
FROM node:20.19.0-alpine3.20@sha256:9a9c00587bcb88209b164b2dba1f59c7389ac3a2cec2cfe490fc43cd947ed531 AS builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --ignore-scripts
COPY frontend/ .
ARG VITE_API_BASE_URL=""
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:1.27.1-alpine3.20@sha256:a5127daff3d6f4606be3100a252419bfa84fd6ee5cd74d0feaca1a5068f97dcf
WORKDIR /usr/share/nginx/html
COPY --from=builder /app/dist .
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
USER nginx
CMD ["nginx", "-g", "daemon off;"]
