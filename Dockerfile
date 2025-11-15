# Use Node.js LTS (Long Term Support) version
FROM node:20-alpine

# Set working directory inside container
WORKDIR /app

# Copy package files first (for better caching)
COPY Python-Platformer/server/package*.json ./

# Install dependencies with optimizations
RUN npm install --omit=dev --prefer-offline --no-audit --progress=false

# Copy the rest of the application
COPY Python-Platformer/ ./Python-Platformer/
COPY Sound/ ./Sound/

# Expose port 3000
EXPOSE 3000

# Set environment variable
ENV NODE_ENV=production

# Start the server
CMD ["node", "Python-Platformer/server/index.js"]
