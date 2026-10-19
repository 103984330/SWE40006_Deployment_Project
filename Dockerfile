# ---- Library Catalogue app image ----
# Small official Node.js base image (Alpine Linux)
FROM node:22-alpine

# Run in production mode (skips dev-only behaviour in libraries)
ENV NODE_ENV=production

# All app files live here inside the container
WORKDIR /app

# Install dependencies first so Docker can cache this layer
# (it only re-runs when package.json / package-lock.json change)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy the application code
COPY src ./src
COPY public ./public
COPY db ./db

# Security: run as the built-in non-root "node" user, not root
USER node

# The app listens on port 3000 (PORT in .env.example)
EXPOSE 3000

# Docker marks the container unhealthy if /health stops responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]
