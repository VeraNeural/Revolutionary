# Build stage# Railway Deployment for VERA

FROM node:18-alpine AS builderFROM node:18-alpine



WORKDIR /appWORKDIR /app



# Copy package files# Copy package files

COPY package*.json ./COPY package*.json ./



# Install dependencies# Install dependencies

RUN npm ci --only=productionRUN npm ci --omit=dev



# Copy source# Copy application code

COPY . .COPY . .



# Production stage# Create public directory if it doesn't exist

FROM node:18-alpineRUN mkdir -p public



WORKDIR /app# Copy HTML files to public directory for serving

RUN cp index.html public/ 2>/dev/null || true

# Install production dependencies onlyRUN cp chat.html public/ 2>/dev/null || true  

COPY --from=builder /app/node_modules ./node_modulesRUN cp vera-ai.html public/ 2>/dev/null || true

COPY --from=builder /app/package*.json ./

COPY --from=builder /app/server.js ./# Expose port

COPY --from=builder /app/lib ./libEXPOSE 8080

COPY --from=builder /app/public ./public

# Health check

# Create non-root userHEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \

RUN addgroup -g 1001 -S nodejs && \  CMD curl -f http://localhost:8080/health || exit 1

    adduser -S nodejs -u 1001 && \

    chown -R nodejs:nodejs /app# Start the application

CMD ["npm", "start"]
USER nodejs

# Environment configuration
ENV NODE_ENV=production
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:$PORT/health || exit 1

# Expose port
EXPOSE 8080

# Start the application
CMD ["node", "server.js"]