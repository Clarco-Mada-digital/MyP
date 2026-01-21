# --- Stage 1: Build ---
FROM node:20-alpine AS build

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build application
RUN npm run build

# --- Stage 2: Production ---
FROM node:20-alpine AS production

WORKDIR /app

# Set environment
ENV NODE_ENV=production
ENV PORT=3333
ENV HOST=0.0.0.0

# Copy built assets and entrypoint from stage 1
COPY --from=build /app/build ./
COPY --from=build /app/entrypoint.sh ./

# Install ONLY production dependencies
RUN npm ci --omit=dev && chmod +x entrypoint.sh

# Expose port
EXPOSE 3333

# Start the application via entrypoint
ENTRYPOINT ["./entrypoint.sh"]
