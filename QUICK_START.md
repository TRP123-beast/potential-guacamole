# ⚡ Quick Start Guide

Get your BrokerBay Auto-Booking System running in 10 minutes!

---

## 🎯 Choose Your Path

### Option A: Deploy to Cloud (Recommended for Partners)
**Perfect for:** Testing with non-technical users, no local setup required

👉 **[Deploy to Railway](https://railway.app)** (Easiest, $5/month)
1. Sign up with GitHub
2. Click "New Project" → "Deploy from GitHub"
3. Select this repository
4. Add environment variables (see below)
5. Add volume: `/app/src/data`
6. Share the URL with partners!

📖 **Full instructions:** See [DEPLOYMENT.md](DEPLOYMENT.md)

---

### Option B: Run Locally with Docker
**Perfect for:** Development and testing on your machine

```bash
# 1. Clone and enter directory
git clone <your-repo-url>
cd potential-guacamole

# 2. Create .env file (copy ENV_TEMPLATE.md)
cp ENV_TEMPLATE.md .env
# Edit .env with your credentials

# 3. Start with Docker Compose
docker-compose up

# 4. Open in browser
open http://localhost:3000
```

---

### Option C: Run Locally without Docker
**Perfect for:** Quick local testing, development

```bash
# 1. Install dependencies
npm install

# 2. Create .env file
# Copy from ENV_TEMPLATE.md and fill in your values

# 3. Start the server
npm run dashboard

# 4. In another terminal, start the scheduler (optional)
npm run scheduler

# 5. Open in browser
open http://localhost:3000
```

---

## 🔐 Required Environment Variables

You'll need these from:
- **Supabase:** Your project dashboard → Settings → API
- **BrokerBay:** Your user account info

```env
# Supabase (from your main application)
SUPABASE_PROJECT_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# Your BrokerBay account
USER_NAME=Your Full Name
USER_EMAIL=your.email@example.com
USER_ORGANIZATION=Your Brokerage Name

# Optional - defaults work fine
DASHBOARD_PORT=3000
HEADLESS=true
ENABLE_AUTO_FETCH=true
FETCH_INTERVAL_MINUTES=12
```

📖 **Full variable list:** See [ENV_TEMPLATE.md](ENV_TEMPLATE.md)

---

## 🎮 Using the Application

### Dashboard (View Bookings)
```
http://localhost:3000/dashboard
```
- View all bookings
- Filter by status
- Search properties
- Export to CSV/JSON

### Auto-Booking Assistant
```
http://localhost:3000/auto-book
```
- Paste property address
- Set preferred time (optional)
- Click "Launch automation"
- Watch live progress
- Done! Booking appears in dashboard

### API
```
http://localhost:3000/api/health
http://localhost:3000/api/bookings
http://localhost:3000/api/stats
```

---

## 🔍 Verify Everything Works

### 1. Check Health
```bash
curl http://localhost:3000/api/health
# Should return: {"success": true, "status": "healthy"}
```

### 2. Check Database
```bash
curl http://localhost:3000/api/bookings
# Should return: {"success": true, "data": [...]}
```

### 3. Check Scheduler (in logs)
```
⏰ Starting automated fetch scheduler...
🔄 Starting automated fetch cycle
📥 Fetching showing requests from Supabase...
```

### 4. Test Auto-Booking
1. Go to `/auto-book`
2. Enter test address: `50 O'Neill Road #1911, Toronto`
3. Click "Launch automation"
4. Watch logs for progress

---

## ⚠️ Common Issues

### "Cannot find module" errors
```bash
npm install
```

### "Database error"
```bash
# Create data directory
mkdir -p src/data

# Restart server
npm run dashboard
```

### "Supabase connection failed"
- Check your `SUPABASE_PROJECT_URL` is correct
- Verify API keys are not expired
- Ensure service role key has permissions

### "Puppeteer: Browser not found"
**In Docker:** Should work automatically
**Locally:** 
```bash
# Install Chrome/Chromium
# macOS: brew install --cask google-chrome
# Ubuntu: sudo apt install chromium-browser
```

### "BrokerBay login failed"
You need to log in once manually:
```bash
# Run with visible browser
HEADLESS=false npm run auto-book "Test Property"
# Log in when prompted
```

---

## 📊 What Runs Automatically

### 1. Dashboard Server
- Port: 3000 (or DASHBOARD_PORT)
- Serves UI and API
- Manages booking automation

### 2. Fetch Scheduler (Every 12 minutes)
- Fetches showing requests from Supabase
- Resolves property IDs to addresses
- Updates properties list in auto-book UI

### 3. Auto-Booking Jobs
- Triggered manually via UI
- Runs Puppeteer automation
- Saves results to database

---

## 🚀 Ready to Deploy?

### For Cloud Deployment:
📖 **[Read DEPLOYMENT.md](DEPLOYMENT.md)** for step-by-step guides:
- Railway (recommended)
- Render
- VPS with Docker

### For Production:
✅ Set `NODE_ENV=production`
✅ Enable `HEADLESS=true`
✅ Set up database backups
✅ Configure monitoring
✅ Add HTTPS (automatic on Railway/Render)

---

## 📖 Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Full deployment guide for Railway, Render, VPS
- **[ENV_TEMPLATE.md](ENV_TEMPLATE.md)** - All environment variables explained
- **[docker-compose.yml](docker-compose.yml)** - Local Docker setup
- **[Dockerfile](Dockerfile)** - Production container config

---

## 🆘 Need Help?

1. **Check the logs:**
   ```bash
   # Docker: docker-compose logs -f
   # Local: Check terminal output
   # Railway/Render: Check platform logs
   ```

2. **Common fixes:**
   - Restart the server
   - Verify environment variables
   - Check database exists: `ls src/data/data.db`
   - Ensure port 3000 is free: `lsof -i :3000`

3. **Still stuck?**
   - Review [DEPLOYMENT.md](DEPLOYMENT.md) troubleshooting section
   - Check your `.env` file matches [ENV_TEMPLATE.md](ENV_TEMPLATE.md)
   - Verify all dependencies: `npm install`

---

## ✨ Tips for Success

### For Development
- Use `HEADLESS=false` to see what's happening
- Enable `SLOW_MO=500` to slow down automation
- Check screenshots in `src/data/screenshots/`

### For Testing with Partners
- Deploy to Railway (easiest setup)
- Share direct link: `https://your-app.railway.app`
- No installation needed on their end!

### For Production
- Use paid tier (Railway Hobby $5 or Render Starter $7)
- Set up database backups
- Monitor logs regularly
- Keep dependencies updated

---

**That's it! You're ready to go. 🎉**

Start with local testing, then deploy to cloud for your partners.

