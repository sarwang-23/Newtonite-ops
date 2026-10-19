# Multi-stage build for Newtonite Operations Under Pressure
FROM node:24-slim AS builder

WORKDIR /app

# Copy package manifests
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install root & frontend dependencies
RUN npm ci
RUN cd frontend && npm ci

# Copy full source
COPY . .

# Build frontend and server
RUN npm run build

# Runtime Stage
FROM node:24-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=10000

# Install production dependencies only (build tools for better-sqlite3 native module)
COPY package*.json ./
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && npm ci --omit=dev \
    && apt-get purge -y python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled backend, source, and frontend build
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/frontend/dist ./frontend/dist

# Expose HTTP port
EXPOSE 3000

# Start application (runs schema migration and auto-seeding if empty)
CMD ["node", "dist/src/index.js"]
