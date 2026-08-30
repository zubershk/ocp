# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY campaign-runner/package.json campaign-runner/package-lock.json ./
RUN npm ci
COPY campaign-runner/ .
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine
WORKDIR /app
COPY campaign-runner/package.json campaign-runner/package-lock.json ./
RUN npm ci --omit=dev
COPY campaign-runner/server/ ./server/
COPY --from=builder /app/dist ./dist/
RUN mkdir -p data uploads
EXPOSE 3001
CMD ["node", "server/index.js"]
