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
ENV PORT=3000
ENV HOST=0.0.0.0
ENV ADONIS_ACE_ANALYTICS=false

# Install system dependencies
RUN apk add --no-cache curl wget tzdata mysql-client \
    && echo "fs.inotify.max_user_watches=524288" >> /etc/sysctl.conf \
    && echo "fs.inotify.max_user_instances=512" >> /etc/sysctl.conf

# Copy built assets and entrypoint from stage 1
COPY --from=build /app/build ./
COPY --from=build /app/entrypoint.sh ./

# Install ONLY production dependencies
RUN npm ci --omit=dev && chmod +x entrypoint.sh

# Create tmp directory for SQLite database
RUN mkdir -p tmp

# Expose port
EXPOSE 3000

# Start the application via entrypoint
ENTRYPOINT ["./entrypoint.sh"]
