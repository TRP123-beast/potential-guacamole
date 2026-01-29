FROM node:20-slim

# 1. Install dependencies required for Puppeteer (Chrome) + cron for scheduling
RUN apt-get update && apt-get install -y \
    chromium \
    cron \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 2. Tell Puppeteer to use the installed Chromium instead of downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# 3. Install NPM dependencies first (better caching)
COPY package*.json ./
RUN npm ci --only=production

# 4. Copy source code
COPY . .

# 5. Create data directory for SQLite database and screenshots
RUN mkdir -p /app/src/data /app/src/data/screenshots && \
    chmod -R 755 /app/src/data

# 6. Expose the port
EXPOSE 3000

# Create persistent session directory
RUN mkdir -p /app/session-data && chmod 700 /app/session-data
# Set session environment variable
ENV BROWSER_PROFILE_USERDATA=/app/session-data

# 7. Start using the entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Use bash to run the entrypoint script
CMD ["/bin/bash", "/usr/local/bin/docker-entrypoint.sh"]
