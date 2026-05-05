# Node on Debian slim: system Chromium for Puppeteer PDF routes (Alpine + bundled Chrome often ENOENT).
FROM node:18-bookworm-slim

# Chromium for headless PDF; skip Puppeteer's own Chrome download in this image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first to take advantage of Docker's layer caching.
COPY package*.json ./

# Install all dependencies from package.json (Puppeteer uses system Chromium via api/utils/puppeteerLaunch.js).
RUN npm install

# Copy the rest of your application code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Command to start the application with a watcher for development
CMD ["npm", "run", "start"]
