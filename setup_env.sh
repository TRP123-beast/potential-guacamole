#!/bin/bash

echo "🔧 Setting up environment for logged-in Broker Bay scraper..."

# Create .env file
cat > .env << EOF
# Session management (for logged-in users)
USE_EXISTING_SESSION=true
CHROME_PROFILE_PATH=/home/sasaka-jr/.config/google-chrome
CHROME_PROFILE_DIR_NAME=Brian

# Proxy settings (optional)
PROXY_LIST=

# Rate limiting settings
MIN_DELAY=2
MAX_DELAY=5
REQUEST_TIMEOUT=30

# Database settings
DATABASE_URL=sqlite:///broker_bay_scraper.db

# Logging level
LOG_LEVEL=INFO
EOF

echo "✅ .env file created successfully!"
echo ""
echo "📋 Configuration:"
echo "- Using existing Chrome session: true"
echo "- Chrome profile path: /home/sasaka-jr/.config/google-chrome"
echo "- Chrome profile dir name: Brian"
echo "- Rate limiting: 2-5 seconds between requests"
echo "- Logging level: INFO"
echo ""
echo "🚀 Ready to test! Run: python3 test_scraper.py"
