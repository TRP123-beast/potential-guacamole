# BrokerBay Auto-Booking System - Complete Implementation Guide

## 📋 Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Prerequisites](#prerequisites)
4. [Installation & Setup](#installation--setup)
5. [Configuration](#configuration)
6. [Usage Guide](#usage-guide)
7. [API Documentation](#api-documentation)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices)
10. [Security Considerations](#security-considerations)

---

## 🎯 Overview

The BrokerBay Auto-Booking System is a comprehensive solution for automating property showing bookings on the BrokerBay platform. It includes:

- **Enhanced Auto-Booking Script** - Automated booking with intelligent element detection
- **Interactive CLI Interface** - User-friendly property search and booking
- **Comprehensive Test Suite** - Automated testing for all components
- **Dashboard & API** - Web-based management interface with REST API
- **Database Integration** - Persistent storage of all bookings

### Key Features

✅ **Automated Login** - Seamless authentication with BrokerBay
✅ **Smart Form Filling** - Intelligent detection and filling of booking forms
✅ **Date & Time Selection** - Automatic selection of available slots
✅ **Auto-Confirm Detection** - Prioritizes instantly confirmable slots
✅ **Screenshot Capture** - Full documentation of the booking process
✅ **Database Storage** - All bookings saved to SQLite database
✅ **Web Dashboard** - Beautiful interface for viewing and managing bookings
✅ **REST API** - Programmatic access to booking data
✅ **Export Functionality** - CSV and JSON export capabilities

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    BrokerBay Platform                        │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ Puppeteer + Stealth Plugin
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              Auto-Booking Scripts Layer                      │
├──────────────────────────────────────────────────────────────┤
│  • auto-book-enhanced.js  - Main booking automation          │
│  • interactive-booking.js - CLI interface                    │
│  • test-auto-booking.js   - Test suite                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ SQLite Database
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                 Data Storage Layer                           │
├──────────────────────────────────────────────────────────────┤
│  • bookings table     - All booking records                  │
│  • properties table   - Property information                 │
│  • Screenshots        - Visual documentation                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      │ REST API
                      │
┌─────────────────────▼───────────────────────────────────────┐
│            Presentation Layer (Dashboard)                    │
├──────────────────────────────────────────────────────────────┤
│  • dashboard-server.js     - Express API server              │
│  • booking-dashboard.html  - Web interface                   │
└──────────────────────────────────────────────────────────────┘
```

---

## 📦 Prerequisites

### Required Software

- **Node.js** v18.0.0 or higher
- **npm** v8.0.0 or higher
- **Google Chrome** or Chromium browser
- **Git** (for version control)

### Required Node Packages

```json
{
  "dependencies": {
    "puppeteer": "^21.0.0",
    "puppeteer-extra": "^3.3.6",
    "puppeteer-extra-plugin-stealth": "^2.11.2",
    "better-sqlite3": "^9.2.0",
    "dotenv": "^16.3.1",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "openai": "^4.20.0"
  }
}
```

### System Requirements

- **RAM**: Minimum 4GB (8GB recommended)
- **Disk Space**: 500MB for dependencies + storage for screenshots
- **Network**: Stable internet connection
- **OS**: Linux, macOS, or Windows

---

## 🚀 Installation & Setup

### Step 1: Clone or Download the Repository

```bash
cd /home/sasaka-jr/potential-guacamole
```

### Step 2: Install Dependencies

```bash
npm install
```

If you encounter issues with `better-sqlite3`, you may need to rebuild it:

```bash
npm rebuild better-sqlite3
```

### Step 3: Install Additional Dependencies

If not already in `package.json`, install:

```bash
npm install express cors
```

### Step 4: Create Environment Configuration

Create a `.env` file in the project root:

```bash
touch .env
```

### Step 5: Configure Environment Variables

Edit `.env` with your settings (see Configuration section below).

### Step 6: Setup Database

The database will be created automatically on first run. To manually initialize:

```bash
node check-local-data.js
```

### Step 7: Test Your Setup

```bash
# Test browser and login
node test-login.js

# Run the test suite
node test-auto-booking.js
```

---

## ⚙️ Configuration

### Environment Variables (.env)

Create a `.env` file with the following variables:

```bash
# ============================================
# BROWSER CONFIGURATION
# ============================================
# Path to your Chrome/Chromium executable
BROWSER_EXECUTABLE_PATH="/usr/bin/google-chrome"

# Browser profile directory (for persistent login)
BROWSER_PROFILE_USERDATA="/home/yourusername/.config/google-chrome"

# Headless mode (false for visible browser, true for headless)
HEADLESS=false

# Slow motion delay in milliseconds (0 for full speed)
SLOW_MO=100

# ============================================
# BROKERBAY CREDENTIALS
# ============================================
# Your BrokerBay login credentials
BROKERBAY_USERNAME="your.email@example.com"
BROKERBAY_PASSWORD="your_password"

# ============================================
# USER PROFILE (for bookings)
# ============================================
# Your name as it appears in bookings
USER_NAME="John Doe"

# Your email for booking notifications
USER_EMAIL="john.doe@example.com"

# Your organization/brokerage
USER_ORGANIZATION="Your Real Estate Company"

# Showing type (Buyer/Broker, Seller/Broker, etc.)
SHOWING_TYPE="Buyer/Broker"

# Preferred duration in minutes (15, 30, 45, or 60)
PREFERRED_DURATION=45

# Only book auto-confirm slots (true/false)
AUTO_CONFIRM_ONLY=false

# Additional notes for bookings
BOOKING_NOTES="Looking forward to viewing the property"

# ============================================
# DASHBOARD CONFIGURATION
# ============================================
# Port for the dashboard server
DASHBOARD_PORT=3000

# ============================================
# SEARCH CONFIGURATION
# ============================================
# Default search query for testing
SEARCH_QUERY="Toronto"

# ============================================
# AI CONFIGURATION (Optional - for future features)
# ============================================
OPENAI_API_KEY="your_openai_api_key_here"
```

### Browser Profile Setup

To avoid having to log in every time:

1. **Find your Chrome profile directory:**
   - **Linux**: `~/.config/google-chrome` or `~/.config/chromium`
   - **macOS**: `~/Library/Application Support/Google/Chrome`
   - **Windows**: `C:\Users\<Username>\AppData\Local\Google\Chrome\User Data`

2. **Set the profile directory in .env:**
   ```bash
   BROWSER_PROFILE_USERDATA="/path/to/your/chrome/profile"
   ```

3. **Login manually once:**
   ```bash
   node test-login.js
   ```

---

## 📖 Usage Guide

### 1. Enhanced Auto-Booking Script

The main automated booking script with advanced features.

#### Basic Usage

```bash
node auto-book-enhanced.js <listing_id> [property_address]
```

#### Examples

```bash
# Book with listing ID only
node auto-book-enhanced.js 68c2ccfc7d9f17efa4fc6a0c

# Book with listing ID and property address
node auto-book-enhanced.js 68c2ccfc7d9f17efa4fc6a0c "266 Brant Avenue, Brantford, ON"
```

#### What It Does

1. ✅ Launches browser with stealth mode
2. ✅ Logs in to BrokerBay automatically
3. ✅ Navigates to the booking page
4. ✅ Fills in your profile information (Step 1)
5. ✅ Selects an available date (Step 2)
6. ✅ Chooses the best time slot with preferred duration (Step 3)
7. ✅ Submits the booking
8. ✅ Verifies confirmation
9. ✅ Saves to database with screenshots
10. ✅ Displays booking summary

#### Screenshot Locations

Screenshots are saved to: `src/data/screenshots/`

- `00_booking_page_loaded_*.png` - Initial page load
- `01_profile_filled_*.png` - After filling profile
- `02_date_selected_*.png` - After selecting date
- `03_time_selected_*.png` - After selecting time
- `04_booking_submitted_*.png` - After submission
- `05_confirmation_*.png` - Final confirmation

---

### 2. Interactive CLI Interface

User-friendly command-line interface for managing bookings.

#### Launch

```bash
node interactive-booking.js
```

#### Features

**Menu Options:**

1. **Search and Book Property** - Search BrokerBay and book in one flow
2. **Quick Book by Listing ID** - Direct booking with known listing ID
3. **View Recent Bookings** - Display last 10 bookings
4. **View All Bookings** - Display all bookings from database
5. **Search Properties in Database** - Search previously scraped properties
6. **Configure User Profile** - View current configuration
7. **Test Browser Login** - Verify login credentials
8. **Exit** - Close the application

#### Usage Flow

```
1. Select "Search and Book Property"
2. Enter property address (e.g., "266 Brant Avenue")
3. Browser opens and searches BrokerBay
4. Select property from results
5. Confirm booking
6. Auto-booking script runs automatically
7. View confirmation in dashboard
```

---

### 3. Test Suite

Comprehensive automated testing for all components.

#### Run All Tests

```bash
node test-auto-booking.js
```

#### Test Cases

1. ✅ **Browser Launch** - Verifies Puppeteer can launch
2. ✅ **Environment Variables** - Checks configuration
3. ✅ **Database Connection** - Tests SQLite database
4. ✅ **Screenshot Directory** - Verifies file system access
5. ✅ **Login Functionality** - Tests BrokerBay authentication
6. ✅ **Navigate to Booking Page** - Tests page navigation
7. ✅ **Form Field Detection** - Verifies form elements
8. ✅ **Form Filling** - Tests input automation
9. ✅ **Calendar Detection** - Checks calendar rendering
10. ✅ **Time Slot Detection** - Verifies slot availability

#### Test Output

```
🧪 BROKER BAY AUTO-BOOKING TEST SUITE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ PASSED: Browser Launch
✅ PASSED: Environment Variables
✅ PASSED: Database Connection
...

📊 TEST SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Tests: 10
✅ Passed: 9
❌ Failed: 1
⏭️  Skipped: 0
Success Rate: 90.0%
```

#### Test Screenshots

Test screenshots are saved to: `src/data/test-screenshots/`

---

### 4. Dashboard & API Server

Web-based dashboard for viewing and managing bookings.

#### Start the Dashboard Server

```bash
node dashboard-server.js
```

#### Access the Dashboard

Open your browser and navigate to:

```
http://localhost:3000
```

or

```
http://localhost:3000/dashboard
```

#### Dashboard Features

- 📊 **Statistics** - Total bookings, auto-confirmed, weekly stats
- 📈 **Charts** - Visual representation of booking data
- 🔍 **Search** - Find bookings by property, address, or listing ID
- 🔽 **Filters** - Filter by status (All, Confirmed, Pending)
- 📥 **Export** - Download as CSV or JSON
- 👁️ **View Details** - Detailed view of each booking
- 🔄 **Refresh** - Reload data from database

#### Dashboard Controls

- **Search Bar** - Type to search across all fields
- **Status Filters** - Click All/Confirmed/Pending to filter
- **Refresh Button** - Reload data from database
- **Export CSV** - Download all bookings as CSV
- **Export JSON** - Download all bookings as JSON
- **View Button** - See detailed booking information

---

## 🌐 API Documentation

The dashboard server provides a REST API for programmatic access.

### Base URL

```
http://localhost:3000/api
```

### Endpoints

#### 1. Get All Bookings

```http
GET /api/bookings
```

**Query Parameters:**
- `status` (string) - Filter by status (Confirmed, Pending)
- `search` (string) - Search term
- `limit` (number) - Results per page (default: 1000)
- `offset` (number) - Pagination offset (default: 0)
- `sortBy` (string) - Sort column (default: created_at)
- `sortOrder` (string) - ASC or DESC (default: DESC)

**Example:**
```bash
curl http://localhost:3000/api/bookings?status=Confirmed&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "listing_id": "68c2ccfc7d9f17efa4fc6a0c",
      "property_address": "266 Brant Avenue",
      "booking_date": "2025-11-22",
      "booking_time": "4:45 PM",
      "duration": "60 minutes",
      "user_name": "John Doe",
      "user_email": "john.doe@example.com",
      "organization": "Your Real Estate Company",
      "showing_type": "Buyer/Broker",
      "status": "Confirmed",
      "auto_confirmed": 1,
      "created_at": "2025-11-22T23:30:00.000Z"
    }
  ],
  "total": 1,
  "limit": 10,
  "offset": 0
}
```

#### 2. Get Single Booking

```http
GET /api/bookings/:id
```

**Example:**
```bash
curl http://localhost:3000/api/bookings/1
```

#### 3. Get Statistics

```http
GET /api/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 15,
    "autoConfirmed": 8,
    "thisWeek": 5,
    "pending": 3,
    "confirmed": 12,
    "statusCounts": [...],
    "recentBookings": [...],
    "topProperties": [...]
  }
}
```

#### 4. Update Booking Status

```http
PATCH /api/bookings/:id
```

**Body:**
```json
{
  "status": "Confirmed"
}
```

**Example:**
```bash
curl -X PATCH http://localhost:3000/api/bookings/1 \
  -H "Content-Type: application/json" \
  -d '{"status":"Confirmed"}'
```

#### 5. Delete Booking

```http
DELETE /api/bookings/:id
```

**Example:**
```bash
curl -X DELETE http://localhost:3000/api/bookings/1
```

#### 6. Export to CSV

```http
GET /api/export/csv
```

Downloads a CSV file with all bookings.

#### 7. Export to JSON

```http
GET /api/export/json
```

Downloads a JSON file with all bookings.

#### 8. Get Properties

```http
GET /api/properties?search=toronto&limit=20
```

Returns properties from the database.

#### 9. Health Check

```http
GET /api/health
```

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-11-22T23:30:00.000Z",
  "database": "connected"
}
```

---

## 🔧 Troubleshooting

### Common Issues and Solutions

#### 1. Browser Launch Failed

**Error:** `Could not find Chrome executable`

**Solution:**
```bash
# Find your Chrome path
which google-chrome
# or
which chromium-browser

# Update .env file
BROWSER_EXECUTABLE_PATH="/usr/bin/google-chrome"
```

#### 2. Login Failed

**Error:** `Login failed - please check credentials`

**Solutions:**
- Verify your credentials in `.env`
- Check if BrokerBay website is accessible
- Try manual login first: `node test-login.js`
- Clear browser cache and cookies
- Ensure 2FA is disabled or handled

#### 3. Form Fields Not Found

**Error:** `Could not find name input field`

**Solutions:**
- BrokerBay may have updated their HTML structure
- Check screenshots in `src/data/screenshots/` to see what the page looks like
- Run with visible browser: `HEADLESS=false node auto-book-enhanced.js ...`
- Update selectors in `auto-book-enhanced.js` if needed

#### 4. No Available Time Slots

**Error:** `No available time slots found`

**Solutions:**
- Property may not have available showing times
- Try a different date
- Check if the property allows online bookings
- Verify the listing ID is correct

#### 5. Database Errors

**Error:** `Database error: ...`

**Solutions:**
```bash
# Check database file
ls -la src/data/data.db

# Rebuild database
rm src/data/data.db
node check-local-data.js

# Check permissions
chmod 755 src/data/
chmod 644 src/data/data.db
```

#### 6. Dashboard Not Loading

**Error:** Dashboard shows "Error loading bookings"

**Solutions:**
- Ensure dashboard server is running: `node dashboard-server.js`
- Check if port 3000 is available: `lsof -i :3000`
- Try a different port: `DASHBOARD_PORT=3001 node dashboard-server.js`
- Check database exists: `ls src/data/data.db`

#### 7. Module Not Found

**Error:** `Cannot find module 'puppeteer-extra'`

**Solution:**
```bash
# Reinstall dependencies
rm -rf node_modules
npm install

# Or install missing package
npm install puppeteer-extra puppeteer-extra-plugin-stealth
```

#### 8. Screenshot Permission Denied

**Error:** `Failed to save screenshot: EACCES`

**Solution:**
```bash
# Create directory with proper permissions
mkdir -p src/data/screenshots
chmod 755 src/data/screenshots
```

---

## ✅ Best Practices

### 1. Rate Limiting

**Don't spam bookings** - Be respectful of BrokerBay's servers:

```bash
# Good: Space out bookings
node auto-book-enhanced.js listing1
sleep 60
node auto-book-enhanced.js listing2

# Bad: Rapid-fire bookings
for id in $(cat listings.txt); do
  node auto-book-enhanced.js $id
done
```

### 2. Error Handling

Always check the exit status and logs:

```bash
node auto-book-enhanced.js <listing_id> 2>&1 | tee booking.log
if [ $? -eq 0 ]; then
  echo "Booking successful!"
else
  echo "Booking failed - check booking.log"
fi
```

### 3. Screenshot Management

Regularly clean up old screenshots:

```bash
# Delete screenshots older than 30 days
find src/data/screenshots/ -name "*.png" -mtime +30 -delete
```

### 4. Database Backup

Backup your database regularly:

```bash
# Create backup
cp src/data/data.db src/data/data_backup_$(date +%Y%m%d).db

# Restore from backup
cp src/data/data_backup_20251122.db src/data/data.db
```

### 5. Environment Security

Never commit your `.env` file:

```bash
# Ensure .env is in .gitignore
echo ".env" >> .gitignore
git rm --cached .env  # If already tracked
```

### 6. Testing Before Production

Always test with demo listings first:

```bash
# Run test suite
node test-auto-booking.js

# Test with known listing
node auto-book-enhanced.js <test_listing_id>
```

### 7. Monitoring

Monitor your bookings:

```bash
# View recent bookings
node check-local-data.js

# Start dashboard
node dashboard-server.js
```

---

## 🔒 Security Considerations

### 1. Credential Protection

- ✅ Store credentials in `.env` (never in code)
- ✅ Use environment variables for sensitive data
- ✅ Add `.env` to `.gitignore`
- ❌ Never commit credentials to version control

### 2. Browser Profile Security

- ✅ Use a dedicated Chrome profile for automation
- ✅ Ensure profile directory has proper permissions (755)
- ❌ Don't share profile with personal browsing

### 3. API Security

For production deployments, add authentication:

```javascript
// Example: Add API key middleware
app.use('/api', (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

### 4. Database Security

```bash
# Set proper permissions
chmod 600 src/data/data.db  # Read/write for owner only
chmod 700 src/data/         # Full access for owner only
```

### 5. HTTPS for Dashboard

For remote access, use HTTPS:

```bash
# Install SSL certificate
# Update dashboard-server.js to use https module
```

---

## 📊 Database Schema

### bookings Table

```sql
CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id TEXT,
  property_address TEXT,
  booking_date TEXT,
  booking_time TEXT,
  duration TEXT,
  user_name TEXT,
  user_email TEXT,
  organization TEXT,
  showing_type TEXT,
  status TEXT,
  auto_confirmed BOOLEAN,
  booking_url TEXT,
  screenshot_path TEXT,
  confirmation_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🎯 Advanced Usage

### Batch Booking

Create a script to book multiple properties:

```bash
#!/bin/bash
# batch-book.sh

# Array of listing IDs
LISTINGS=(
  "68c2ccfc7d9f17efa4fc6a0c"
  "68c2ccfc7d9f17efa4fc6a0d"
  "68c2ccfc7d9f17efa4fc6a0e"
)

for LISTING in "${LISTINGS[@]}"; do
  echo "Booking listing: $LISTING"
  node auto-book-enhanced.js "$LISTING"
  
  # Wait 60 seconds between bookings
  echo "Waiting 60 seconds..."
  sleep 60
done

echo "All bookings complete!"
```

### Automated Daily Bookings

Use cron to schedule automated bookings:

```bash
# Edit crontab
crontab -e

# Add this line to run daily at 9 AM
0 9 * * * cd /home/sasaka-jr/potential-guacamole && node auto-book-enhanced.js <listing_id> >> /var/log/auto-booking.log 2>&1
```

### Integration with Other Scripts

```javascript
// Example: Integrate with your property scraper
import { spawn } from 'child_process';

async function bookProperty(listingId, address) {
  return new Promise((resolve, reject) => {
    const process = spawn('node', [
      'auto-book-enhanced.js',
      listingId,
      address
    ]);
    
    process.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, listingId });
      } else {
        reject(new Error(`Booking failed with code ${code}`));
      }
    });
  });
}
```

---

## 📝 Changelog & Updates

### Version 2.0.0 (Current)

- ✅ Enhanced element detection with multiple selector strategies
- ✅ Improved login integration with stealth mode
- ✅ Auto-confirm slot prioritization
- ✅ Interactive CLI interface
- ✅ Comprehensive test suite
- ✅ Web dashboard with REST API
- ✅ Export functionality (CSV/JSON)
- ✅ Better error handling and logging
- ✅ Screenshot documentation

### Version 1.0.0 (Previous)

- Basic auto-booking functionality
- Simple database storage
- Manual configuration

---

## 🤝 Support & Contribution

### Getting Help

1. Check this documentation first
2. Review the troubleshooting section
3. Check screenshots in `src/data/screenshots/`
4. Run the test suite: `node test-auto-booking.js`
5. Enable visible browser mode: `HEADLESS=false`

### Reporting Issues

When reporting issues, include:

- Error message
- Screenshots from `src/data/screenshots/`
- Console output
- Environment details (OS, Node version)
- Steps to reproduce

---

## 📚 Additional Resources

### Files Reference

- `auto-book-enhanced.js` - Main booking script
- `interactive-booking.js` - CLI interface
- `test-auto-booking.js` - Test suite
- `dashboard-server.js` - API server
- `booking-dashboard.html` - Web dashboard
- `demo-booking.js` - Demo/simulation script
- `test-login.js` - Login testing
- `check-local-data.js` - Database viewer

### Configuration Files

- `.env` - Environment variables
- `package.json` - Dependencies
- `src/data/data.db` - SQLite database

### Directories

- `src/data/screenshots/` - Booking screenshots
- `src/data/test-screenshots/` - Test screenshots
- `src/property-scraper/` - Property scraping utilities
- `src/property-monitors/` - Monitoring scripts

---

## 🎉 Quick Start Checklist

- [ ] Install Node.js and npm
- [ ] Clone/download the project
- [ ] Run `npm install`
- [ ] Create `.env` file with your configuration
- [ ] Test login: `node test-login.js`
- [ ] Run test suite: `node test-auto-booking.js`
- [ ] Book your first property: `node auto-book-enhanced.js <listing_id>`
- [ ] Start dashboard: `node dashboard-server.js`
- [ ] Open dashboard at http://localhost:3000
- [ ] Export your bookings

---

## 📞 Contact & License

This is a custom implementation for BrokerBay property booking automation.

**Important:** Use responsibly and in compliance with BrokerBay's Terms of Service.

---

**Last Updated:** November 22, 2025
**Version:** 2.0.0
**Status:** Production Ready ✅

