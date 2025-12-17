# Environment Variables Template

Copy this template and create a `.env` file in your project root, or add these as environment variables in your hosting platform.

## Required Variables

```bash
# ==================== SERVER CONFIGURATION ====================
DASHBOARD_PORT=3000
NODE_ENV=production

# ==================== PUPPETEER/BROWSER CONFIGURATION ====================
HEADLESS=true
SLOW_MO=100

# ==================== USER PROFILE (FOR AUTO-BOOKING) ====================
USER_NAME=Your Full Name
USER_EMAIL=your.email@example.com
USER_ORGANIZATION=Your Brokerage Name
SHOWING_TYPE=Buyer/Broker
PREFERRED_DURATION=60
AUTO_CONFIRM_ONLY=false

# ==================== SUPABASE CONFIGURATION ====================
SUPABASE_PROJECT_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# ==================== SCHEDULER CONFIGURATION ====================
ENABLE_AUTO_FETCH=true
FETCH_INTERVAL_MINUTES=12
```

## Optional Variables

```bash
# Browser profile for persistent sessions
BROWSER_PROFILE_USERDATA=./chrome-profile

# Default booking notes
BOOKING_NOTES=

# Preferred booking time
PREFERRED_TIME=10:00 AM

# Custom browser path (usually not needed in Docker)
BROWSER_EXECUTABLE_PATH=/usr/bin/chromium
```

## Security Notes

🔒 **IMPORTANT:**
- Never commit the actual `.env` file to git
- Keep `SUPABASE_SERVICE_ROLE_KEY` secret
- Use platform environment variables for production
- Don't hardcode passwords - use browser profile persistence

## Platform-Specific Setup

### Railway
1. Go to your project → Variables tab
2. Add each variable from the template above
3. Railway will automatically restart your app

### Render
1. Go to your service → Environment tab
2. Add each variable as a key-value pair
3. Click "Save Changes"

### Docker Compose
1. Create a `.env` file in the project root
2. Copy the template above and fill in your values
3. Docker Compose will automatically load it

## Testing Your Setup

After setting environment variables:

```bash
# Test locally with Docker
docker-compose up

# Or test without Docker
npm install
node dashboard-server.js
```

Visit `http://localhost:3000` to see if the dashboard loads.

