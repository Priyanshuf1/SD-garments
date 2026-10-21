# ==============================================================================
# ALLYRICH D2C Streetwear Platform - Production Dockerfile
# Multi-Stage, Minimalist Alpine Linux base with Non-Root Security & Healthcheck
# ==============================================================================

# ------------------------------------------------------------------------------
# STAGE 1: Dependency Resolver & Builder
# ------------------------------------------------------------------------------
FROM node:20-alpine AS dependencies

WORKDIR /usr/src/app

# Install security tools & dependencies
RUN apk add --no-cache libc6-compat

# Copy package manifests first to leverage Docker layer caching
COPY package.json package-lock.json* ./

# Install only production dependencies
RUN npm ci --only=production --ignore-scripts

# ------------------------------------------------------------------------------
# STAGE 2: Production Runtime
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

# Install dumb-init for proper Linux PID 1 signal forwarding (SIGTERM / SIGINT)
RUN apk add --no-cache dumb-init wget

# Set production environment variables
ENV NODE_ENV=production \
    PORT=3000

# Copy node_modules from dependencies stage
COPY --from=dependencies /usr/src/app/node_modules ./node_modules

# Copy application source code
COPY . .

# Set correct ownership for built-in unprivileged 'node' user
RUN chown -R node:node /usr/src/app

# Switch from root to non-root user (Security Best Practice)
USER node

# Expose HTTP port
EXPOSE 3000

# Container Healthcheck (polled by AWS ECS / Docker / Kubernetes)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Execute Node.js server via dumb-init for graceful shutdown
CMD ["dumb-init", "node", "server.js"]
