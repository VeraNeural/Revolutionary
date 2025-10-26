# Railway Deployment for VERA
# Node.js 18 Alpine for smaller image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY . .

# Expose port (Railway will override with PORT env var)
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]
