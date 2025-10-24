# Railway Deployment for VERA
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Create public directory if it doesn't exist
RUN mkdir -p public

# Copy HTML files to public directory for serving
RUN cp index.html public/ 2>/dev/null || true
RUN cp chat.html public/ 2>/dev/null || true  
RUN cp vera-ai.html public/ 2>/dev/null || true

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Start the application
CMD ["npm", "start"]