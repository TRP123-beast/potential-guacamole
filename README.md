# 🏠 BrokerBay Auto-Booking System

**Automated showing booking system for BrokerBay real estate platform.**

[![Deploy to Railway](https://railway.app/button.svg)](https://railway.app/new)

---

## 📖 Table of Contents

- [Features](#-features)
- [Quick Start](#-quick-start)
- [Documentation](#-documentation)
- [Architecture](#-architecture)
- [Deployment](#-deployment)
- [Usage](#-usage)
- [Development](#-development)
- [FAQ](#-faq)

---

## ✨ Features

### 🤖 Automated Booking
- **Intelligent search** - Finds properties on BrokerBay automatically
- **Smart time selection** - Picks best available slots (prefers AUTO-CONFIRM)
- **Form automation** - Fills booking forms with your profile
- **Stealth mode** - Uses Puppeteer with anti-detection

### 📊 Dashboard
- **Real-time tracking** - View all bookings in one place
- **Advanced filtering** - Search by property, status, date
- **Live updates** - Watch automation progress in real-time
- **Export data** - Download bookings as CSV or JSON

### ⏰ Automated Scheduling
- **Auto-fetch** - Syncs showing requests from Supabase every 10-15 minutes
- **Address resolution** - Converts property IDs to searchable addresses
- **Rate limiting** - Respects API limits automatically
- **Error recovery** - Retries failed fetches intelligently

### 🎨 Modern UI
- **Beautiful interface** - Clean, professional design
- **Mobile responsive** - Works on all devices
- **Real-time logs** - See what's happening as it happens
- **One-click booking** - Start automation with a button click

---

## 🚀 Quick Start

### ⚡ 60-Second Deploy (Railway)

1. **Click the "Deploy to Railway" button above**
2. **Add environment variables** (see [ENV_TEMPLATE.md](ENV_TEMPLATE.md))
3. **Add a volume:** `/app/src/data`
4. **Done!** Share the URL with your team

📖 **Detailed guide:** [QUICK_START.md](QUICK_START.md)

### 🐳 Local with Docker

```bash
# 1. Clone repository
git clone <your-repo-url>
cd potential-guacamole

# 2. Configure environment
cp ENV_TEMPLATE.md .env
# Edit .env with your credentials

# 3. Start everything
docker-compose up

# 4. Open browser
open http://localhost:3000
```

### 💻 Local without Docker

```bash
# 1. Install dependencies
npm install

# 2. Configure environment  
# Create .env file from ENV_TEMPLATE.md

# 3. Start services
npm run dashboard    # Terminal 1: Dashboard server
npm run scheduler    # Terminal 2: Fetch scheduler (optional)

# 4. Open browser
open http://localhost:3000
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **[QUICK_START.md](QUICK_START.md)** | Get running in 10 minutes |
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | Full deployment guide for Railway, Render, VPS |
| **[ENV_TEMPLATE.md](ENV_TEMPLATE.md)** | All environment variables explained |

---

## 🏗️ Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    BrokerBay Auto-Booking                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────┐ │
│  │   Dashboard   │  │   Auto-Book   │  │    Scheduler    │ │
│  │   Server      │  │   Assistant   │  │   (Background)  │ │
│  │               │  │               │  │                 │ │
│  │ Express API   │  │ Puppeteer     │  │ Fetch cycles    │ │
│  │ Serves UI     │  │ Automation    │  │ Every 12 min    │ │
│  └───────┬───────┘  └───────┬───────┘  └────────┬────────┘ │
│          │                  │                     │          │
│          └──────────────────┴─────────────────────┘          │
│                            │                                 │
│                   ┌────────▼────────┐                        │
│                   │  SQLite Database │                        │
│                   │   (data.db)     │                        │
│                   │                 │                        │
│                   │ • bookings      │                        │
│                   │ • properties    │                        │
│                   │ • showing_reqs  │                        │
│                   └─────────────────┘                        │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
         ┌──────▼──────┐        ┌──────▼──────┐
         │  BrokerBay  │        │   Supabase  │
         │   Website   │        │   Database  │
         │             │        │             │
         │ Automation  │        │ Source data │
         │   Target    │        │  for fetch  │
         └─────────────┘        └─────────────┘
```

### Files Structure

```
potential-guacamole/
├── auto-book-enhanced.js          # Main booking automation script
├── dashboard-server.js            # Express server (UI + API)
├── scheduler.js                   # Automated fetch scheduler
├── fetch-showing-requests.js      # Supabase sync
├── fetch-property-addresses.js    # Address resolution
├── auto-book-dashboard.html       # Auto-booking UI
├── booking-dashboard.html         # Bookings view UI
├── src/
│   ├── data/
│   │   ├── data.db               # SQLite database (auto-created)
│   │   └── screenshots/          # Automation screenshots
│   └── utils.js                  # Shared utilities
├── Dockerfile                     # Production container
├── docker-compose.yml             # Local development setup
├── docker-entrypoint.sh           # Container startup script
├── package.json                   # Dependencies
└── Documentation/
    ├── README.md                  # This file
    ├── QUICK_START.md            # Quick setup guide
    ├── DEPLOYMENT.md             # Deployment instructions
    └── ENV_TEMPLATE.md           # Environment variables
```

---

## 🌐 Deployment

### Recommended Platforms

| Platform | Best For | Cost | Setup Time |
|----------|----------|------|------------|
| **Railway** | Production + Testing | $5/month | 5 minutes |
| **Render** | Alternative cloud | $7/month | 10 minutes |
| **VPS** | Full control | $5-10/month | 30 minutes |

### Quick Deploy Links

- **Railway:** [Deploy Now](https://railway.app/new)
- **Render:** [Deploy Now](https://render.com)
- **DigitalOcean:** [Get $200 Credit](https://try.digitalocean.com/freetrialoffer/)

📖 **Full instructions:** [DEPLOYMENT.md](DEPLOYMENT.md)

### What You Need

- ✅ Supabase project (for showing requests)
- ✅ BrokerBay account (for automation)
- ✅ Basic environment variables (see ENV_TEMPLATE.md)

---

## 💡 Usage

### Dashboard - View Bookings

**URL:** `http://your-app.com/dashboard`

- 📋 View all bookings
- 🔍 Search and filter
- 📊 See statistics
- 📥 Export to CSV/JSON
- ✏️ Update booking status
- 🗑️ Delete old bookings

### Auto-Book Assistant

**URL:** `http://your-app.com/auto-book`

**Simple 3-step process:**

1. **Enter property address**
   ```
   Example: 50 O'Neill Road #1911, Toronto
   ```
   
2. **Set preferences (optional)**
   - Preferred time: `10:00 AM`
   - Preferred date: `15` (day of month)
   - Show browser: For debugging
   - Auto-confirm only: Skip manual approval slots

3. **Click "Launch automation"**
   - Watch live progress
   - Booking appears in dashboard automatically
   - Screenshots saved for review

### Scheduled Properties

The system automatically:
- Fetches showing requests from Supabase every 12 minutes
- Resolves property IDs to searchable addresses
- Displays them in the auto-book UI for quick access

Just click a scheduled property to prefill the booking form!

### API Endpoints

```bash
# Health check
GET /api/health

# Get all bookings
GET /api/bookings?status=Confirmed&limit=50

# Get single booking
GET /api/bookings/:id

# Get statistics
GET /api/stats

# Get scheduled properties
GET /api/scheduled-properties

# Create auto-booking job
POST /api/auto-book
{
  "property": "50 O'Neill Road #1911, Toronto",
  "preferredTime": "10:00 AM",
  "preferredDate": "15",
  "headless": true,
  "autoConfirmOnly": false
}

# Stream booking progress
GET /api/auto-book/:jobId/stream  # Server-Sent Events

# Export bookings
GET /api/export/csv
GET /api/export/json
```

---

## 🛠️ Development

### Prerequisites

- Node.js 18+
- Chrome/Chromium (for Puppeteer)
- SQLite3 (usually pre-installed)

### Setup

```bash
# Clone repository
git clone <your-repo-url>
cd potential-guacamole

# Install dependencies
npm install

# Create .env file
cp ENV_TEMPLATE.md .env
# Edit with your credentials

# Start development server
npm run dashboard
```

### Available Scripts

```bash
npm run dashboard         # Start dashboard server
npm run scheduler         # Start fetch scheduler
npm run auto-book        # Run booking automation
npm run fetch:showings   # Fetch showing requests manually
npm run fetch:addresses  # Fetch property addresses manually
npm run docker:build     # Build Docker image
npm run docker:up        # Start with Docker Compose
npm run docker:logs      # View Docker logs
```

### Development Tips

```bash
# See what's happening (visible browser)
HEADLESS=false npm run auto-book "Test Property"

# Slow down for debugging
SLOW_MO=1000 npm run auto-book "Test Property"

# Test scheduler once
node scheduler.js

# Test fetch scripts
npm run fetch:showings
npm run fetch:addresses

# Check database
sqlite3 src/data/data.db "SELECT * FROM bookings;"
```

### Environment Variables for Development

```env
# Use non-headless mode to see browser
HEADLESS=false

# Slow down actions for debugging
SLOW_MO=500

# Disable auto-fetch during development
ENABLE_AUTO_FETCH=false

# Use shorter interval for testing scheduler
FETCH_INTERVAL_MINUTES=1
```

---

## ❓ FAQ

### Q: How do I handle BrokerBay login?

**A:** The app uses browser profile persistence. Options:

1. **Recommended:** Run locally once with `HEADLESS=false`, log in, then upload the `chrome-profile/` directory to your server
2. **Alternative:** Use a VPS where you can access the browser directly
3. **Not recommended:** Hardcode credentials (security risk)

### Q: Will this work with my BrokerBay account?

**A:** Yes! The automation adapts to:
- Different property types
- Various showing formats
- Multiple brokerage setups
- Any user profile

Just configure your `USER_NAME`, `USER_EMAIL`, and `USER_ORGANIZATION`.

### Q: How often does it check for new properties?

**A:** By default, every 12 minutes. Configure with:
```env
FETCH_INTERVAL_MINUTES=12  # Adjust 10-15 recommended
```

### Q: Can I disable the automated fetching?

**A:** Yes:
```env
ENABLE_AUTO_FETCH=false
```
You can still manually run:
```bash
npm run fetch:showings
npm run fetch:addresses
```

### Q: What if a booking fails?

**A:** The system:
1. Takes screenshots at each step
2. Logs all errors with details
3. Saves partial progress to database
4. You can retry manually from the UI

Check `src/data/screenshots/` for debugging.

### Q: How much does it cost to run?

**Railway/Render:** $5-7/month for always-on service
**VPS:** $5-10/month (DigitalOcean, Linode, etc.)
**Free tiers:** Available but with limitations (cold starts, time limits)

### Q: Is my data secure?

**A:** Yes:
- All data stored locally in SQLite (your control)
- No external API calls except BrokerBay and Supabase
- Environment variables keep credentials secure
- Use HTTPS in production (automatic on Railway/Render)

### Q: Can multiple users book simultaneously?

**A:** Yes! The system handles:
- Multiple concurrent bookings
- Job queue management
- Real-time progress streaming for each job

### Q: What browsers are supported for the UI?

**A:** All modern browsers:
- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers (responsive design)

### Q: How do I update after deployment?

**Railway/Render:**
```bash
git push origin main  # Automatic deployment
```

**Docker/VPS:**
```bash
git pull
docker-compose down
docker-compose up -d --build
```

### Q: Can I customize the booking logic?

**A:** Yes! Edit `auto-book-enhanced.js`:
- Change time slot selection logic
- Add custom form fields
- Modify search behavior
- Add notification webhooks

---

## 🔒 Security

- ✅ Never commit `.env` files
- ✅ Use environment variables for credentials
- ✅ Rotate API keys regularly
- ✅ Enable HTTPS in production
- ✅ Keep dependencies updated: `npm audit && npm update`
- ✅ Use service role keys sparingly (read-only when possible)

---

## 📈 Roadmap

- [ ] Email notifications on booking success/failure
- [ ] Slack/Discord webhook integrations
- [ ] Multiple BrokerBay account support
- [ ] Booking calendar view
- [ ] Advanced scheduling (recurring bookings)
- [ ] Analytics dashboard
- [ ] Mobile app (React Native)

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

This project is private and proprietary. All rights reserved.

---

## 📞 Support

- 📧 Email: [your-email@example.com]
- 💬 Slack: [Your Slack Channel]
- 🐛 Issues: [GitHub Issues](your-repo-url/issues)

---

## 🙏 Acknowledgments

Built with:
- [Puppeteer](https://pptr.dev/) - Browser automation
- [Express](https://expressjs.com/) - Web framework
- [Better-SQLite3](https://github.com/WiseLibs/better-sqlite3) - Database
- [Supabase](https://supabase.com/) - Data sync

---

## 📊 Project Status

![Status](https://img.shields.io/badge/status-active-success.svg)
![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-proprietary-red.svg)

---

**Made with ❤️ for real estate professionals**
