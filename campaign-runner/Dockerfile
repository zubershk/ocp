# Stage 1: Build
FROM node:20.19.0-alpine3.20@sha256:6e6c8c8f5d5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5 AS builder
WORKDIR /app
COPY campaign-runner/package.json campaign-runner/package-lock.json ./
RUN npm ci --ignore-scripts
COPY campaign-runner/ .
RUN npm run build

# Stage 2: Runtime
FROM node:20.19.0-alpine3.20@sha256:6e6c8c8f5d5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5e5f5
WORKDIR /app
ENV NODE_ENV=production
COPY campaign-runner/package.json campaign-runner/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY campaign-runner/server/ ./server/
COPY --from=builder /app/dist ./dist/
RUN mkdir -p data uploads && chown -R node:node /app
EXPOSE 3001
USER node
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://localhost:3001/health || exit 1
CMD ["node", "server/index.js"]
