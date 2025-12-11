FROM node:18-slim

# 1. Install dependencies required for Puppeteer (Chrome)
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 2. Tell Puppeteer to use the installed Chromium instead of downloading its own
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# 3. Install NPM dependencies
COPY package*.json ./
RUN npm install

# 4. Copy source code
COPY . .

# 5. Expose the port
EXPOSE 3000

# 6. Start the server
CMD ["node", "dashboard-server.js"]
