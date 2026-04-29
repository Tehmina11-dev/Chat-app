# ============================================
# Build Stage: Compile TypeScript to JavaScript
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy only dependency files (improves layer caching)
# If package.json or package-lock.json change, only this layer is rebuilt
COPY package*.json ./

# Install all dependencies (including devDependencies needed for TypeScript compilation)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# ============================================
# Production Stage: Lightweight runtime image
# ============================================
FROM node:20-alpine

WORKDIR /app

# Install dumb-init for proper signal handling (PID 1 problem)
RUN apk add --no-cache dumb-init

# Copy only package files for production installs
COPY package*.json ./

# Install only production dependencies (removes devDependencies)
RUN npm ci --only=production && \
    npm cache clean --force

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Create uploads directory with proper permissions
RUN mkdir -p /app/uploads && \
    chmod 755 /app/uploads

# Health check (optional but recommended)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {if (r.statusCode !== 200) throw new Error()})"

# Expose port
EXPOSE 4000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application (npm start runs: node dist/index.js)
CMD ["npm", "start"]
