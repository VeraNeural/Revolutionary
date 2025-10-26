# Railway Deployment for VERA
# Node.js 20 Alpine for smaller image size
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (skip prepare script to avoid husky)
RUN npm install --production --ignore-scripts

# Copy application code
COPY . .

# Expose port (Railway will override with PORT env var)
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]
