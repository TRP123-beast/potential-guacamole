# 🏠 BrokerBay Auto-Booking System

**Automate your property showing bookings on BrokerBay with intelligent automation**

[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-production-success)](README.md)

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure your settings
cp .env.example .env
nano .env  # Add your credentials

# 3. Test your setup
node test-login.js

# 4. Book a property
node auto-book-enhanced.js 68c2ccfc7d9f17efa4fc6a0c "266 Brant Avenue"

# 5. View your bookings
node dashboard-server.js
# Open http://localhost:3000
```

---

## ✨ Features

### 🤖 Automated Booking
- **Smart Form Filling** - Automatically fills all booking forms
- **Date & Time Selection** - Intelligently selects available slots
- **Auto-Confirm Priority** - Prefers instantly confirmable bookings
- **Screenshot Documentation** - Captures every step of the process

### 🖥️ Interactive Interface
- **CLI Menu** - User-friendly command-line interface
- **Property Search** - Search and book directly from BrokerBay
- **Booking Management** - View, filter, and export bookings

### 📊 Web Dashboard
- **Real-time Stats** - Track all your bookings
- **Beautiful UI** - Modern, responsive design
- **Export Functions** - Download as CSV or JSON
- **REST API** - Programmatic access to data

### 🧪 Testing & Reliability
- **Comprehensive Test Suite** - 10+ automated tests
- **Error Handling** - Robust retry mechanisms
- **Detailed Logging** - Full audit trail

---

## 📸 Screenshots

### Booking Process
The script automatically handles the 3-step booking process shown in your screenshots:

**Step 1: Your Profile**
- Name, Email, Organization
- Showing Type selection

**Step 2: Select Date**
- Calendar navigation
- Available date selection

**Step 3: Select Time**
- Duration selection (15, 30, 45, 60 minutes)
- Time slot selection
- Auto-confirm detection ⚡

### Dashboard Interface
Modern web dashboard for managing all your bookings with:
- 📊 Statistics and charts
- 🔍 Search and filtering
- 📥 Export capabilities
- 👁️ Detailed booking views

---

## 📋 What You Need

### Required
- **Node.js** v18+ ([Download](https://nodejs.org/))
- **Google Chrome** browser
- **BrokerBay Account** with login credentials

### 5 Minutes Setup
1. Install Node.js
2. Run `npm install`
3. Create `.env` file with your credentials
4. Start booking!

---

## 🎯 Usage Examples

### Example 1: Quick Booking

```bash
node auto-book-enhanced.js 68c2ccfc7d9f17efa4fc6a0c "266 Brant Avenue"
```

**Output:**
```
🤖 BROKER BAY ENHANCED AUTO-BOOKING SCRIPT
══════════════════════════════════════════

Property: 266 Brant Avenue
Listing ID: 68c2ccfc7d9f17efa4fc6a0c

✅ Step 1: Profile information filled
✅ Step 2: Date selected
✅ Step 3: Time slot selected
✅ Step 4: Booking submitted
✅ Step 5: Booking confirmed!
✅ Step 6: Saved to database (ID: 42)

✅ BOOKING COMPLETE
══════════════════════════════════════════
📍 Property: 266 Brant Avenue
📅 Date: 2025-11-22
🕐 Time: 4:45 PM - 5:45 PM
✨ Status: ⚡ AUTO-CONFIRMED
```

### Example 2: Interactive Mode

```bash
node interactive-booking.js
```

**Features:**
- Search properties by address
- View recent bookings
- Quick book by listing ID
- Export bookings
- Test login

### Example 3: Batch Booking

```bash
# Create a list of properties
cat << EOF > properties.txt
68c2ccfc7d9f17efa4fc6a0c|266 Brant Avenue
68c2ccfc7d9f17efa4fc6a0d|50 O'Neill Road
68c2ccfc7d9f17efa4fc6a0e|33 Singer Court
EOF

# Book all properties
while IFS='|' read -r id address; do
  node auto-book-enhanced.js "$id" "$address"
  sleep 60  # Wait 1 minute between bookings
done < properties.txt
```

---

## ⚙️ Configuration

### Minimal .env Configuration

```bash
# Browser Settings
BROWSER_EXECUTABLE_PATH="/usr/bin/google-chrome"
BROWSER_PROFILE_USERDATA="/home/yourusername/.config/google-chrome"
HEADLESS=false

# Your Profile
USER_NAME="John Doe"
USER_EMAIL="john.doe@example.com"
USER_ORGANIZATION="Your Real Estate Company"
SHOWING_TYPE="Buyer/Broker"
PREFERRED_DURATION=45

# BrokerBay Login
BROKERBAY_USERNAME="your.email@example.com"
BROKERBAY_PASSWORD="your_password"
```

### Optional Settings

```bash
# Advanced Options
AUTO_CONFIRM_ONLY=false      # Only book auto-confirm slots
SLOW_MO=100                  # Slow down for debugging
BOOKING_NOTES="..."          # Custom notes for bookings
DASHBOARD_PORT=3000          # Dashboard server port
```

---

## 📊 Dashboard

### Start the Server

```bash
node dashboard-server.js
```

**Console Output:**
```
🚀 Dashboard Server Running
══════════════════════════════════════════
📊 Dashboard URL: http://localhost:3000
🔌 API Endpoint: http://localhost:3000/api
📁 Database: src/data/data.db
══════════════════════════════════════════
```

### Access the Dashboard

Open your browser: **http://localhost:3000**

### API Endpoints

```bash
# Get all bookings
curl http://localhost:3000/api/bookings

# Get booking by ID
curl http://localhost:3000/api/bookings/1

# Get statistics
curl http://localhost:3000/api/stats

# Export to CSV
curl http://localhost:3000/api/export/csv -o bookings.csv

# Health check
curl http://localhost:3000/api/health
```

---

## 🧪 Testing

### Run Full Test Suite

```bash
node test-auto-booking.js
```

**Tests Include:**
- ✅ Browser launch
- ✅ Environment configuration
- ✅ Database connection
- ✅ Login functionality
- ✅ Form field detection
- ✅ Calendar and time slot detection
- ✅ Booking flow simulation

### Test Individual Components

```bash
# Test login only
node test-login.js

# Check database
node check-local-data.js

# Run demo (simulated booking)
node demo-booking.js
```

---

## 🔧 Troubleshooting

### Issue: Login Failed

```bash
# Test your credentials
node test-login.js

# Check browser profile
echo $BROWSER_PROFILE_USERDATA
ls -la "$BROWSER_PROFILE_USERDATA"
```

### Issue: Element Not Found

```bash
# Run with visible browser
HEADLESS=false node auto-book-enhanced.js <listing_id>

# Check screenshots
ls -la src/data/screenshots/
```

### Issue: No Time Slots

- Property may not have available slots
- Try a different date
- Check if property allows online booking
- Verify listing ID is correct

### Issue: Database Error

```bash
# Rebuild database
rm src/data/data.db
node check-local-data.js

# Check permissions
chmod 755 src/data/
chmod 644 src/data/data.db
```

---

## 📁 Project Structure

```
potential-guacamole/
├── auto-book-enhanced.js          # Main booking script
├── interactive-booking.js         # CLI interface
├── test-auto-booking.js          # Test suite
├── dashboard-server.js           # API server
├── booking-dashboard.html        # Web dashboard
├── demo-booking.js               # Demo/simulation
├── test-login.js                 # Login testing
├── check-local-data.js           # Database viewer
├── .env                          # Configuration (create this)
├── package.json                  # Dependencies
├── IMPLEMENTATION-GUIDE.md       # Detailed documentation
└── src/
    ├── data/
    │   ├── data.db              # SQLite database
    │   ├── screenshots/         # Booking screenshots
    │   └── test-screenshots/    # Test screenshots
    ├── property-scraper/        # Scraping utilities
    ├── property-monitors/       # Monitoring scripts
    └── utils.js                 # Shared utilities
```

---

## 🎓 How It Works

### The 3-Step Booking Process

Based on the BrokerBay interface shown in your screenshots:

#### Step 1: Your Profile (Form Filling)
```javascript
// Automatically fills:
- Name field
- Email field
- Showing Type dropdown
```

#### Step 2: Select Date (Calendar Navigation)
```javascript
// Intelligently:
- Finds calendar element
- Selects today or nearest available date
- Waits for time slots to load
```

#### Step 3: Select Time (Time Slot Selection)
```javascript
// Smart selection:
- Identifies available time slots
- Prioritizes AUTO-CONFIRM slots (green)
- Selects preferred duration
- Handles "Done" button
- Clicks final confirmation
```

### Under the Hood

```
Puppeteer + Stealth Plugin
    ↓
Browser Automation
    ↓
Element Detection (Multiple Strategies)
    ↓
Form Interaction
    ↓
Screenshot Capture
    ↓
Database Storage
    ↓
API/Dashboard
```

---

## 🔒 Security & Best Practices

### ✅ Do's

- ✅ Store credentials in `.env` file
- ✅ Add `.env` to `.gitignore`
- ✅ Use a dedicated browser profile
- ✅ Space out your bookings (60+ seconds)
- ✅ Backup your database regularly
- ✅ Review screenshots after booking
- ✅ Test with demo listings first

### ❌ Don'ts

- ❌ Commit `.env` to version control
- ❌ Spam bookings rapidly
- ❌ Share your browser profile
- ❌ Run on untrusted networks
- ❌ Skip testing before production use

---

## 📚 Documentation

### Full Documentation
See **[IMPLEMENTATION-GUIDE.md](IMPLEMENTATION-GUIDE.md)** for:
- Detailed setup instructions
- Advanced configuration
- API documentation
- Troubleshooting guide
- Best practices
- Security considerations

### Quick Reference

| Task | Command |
|------|---------|
| **Book Property** | `node auto-book-enhanced.js <id> [address]` |
| **Interactive Mode** | `node interactive-booking.js` |
| **Start Dashboard** | `node dashboard-server.js` |
| **Run Tests** | `node test-auto-booking.js` |
| **Test Login** | `node test-login.js` |
| **View Data** | `node check-local-data.js` |
| **Demo** | `node demo-booking.js` |

---

## 📈 Success Metrics

After implementation, you can:

- ✅ Book properties in **under 30 seconds**
- ✅ Automate **multiple bookings** per day
- ✅ Track **all bookings** in one dashboard
- ✅ Export data for **reporting**
- ✅ **Zero manual form filling**
- ✅ **Complete documentation** of every booking

---

## 🤝 Support

### Need Help?

1. **Check Documentation**: [IMPLEMENTATION-GUIDE.md](IMPLEMENTATION-GUIDE.md)
2. **Run Tests**: `node test-auto-booking.js`
3. **Check Logs**: Review console output and screenshots
4. **Test Components**: Use individual test scripts

### Common Questions

**Q: How long does a booking take?**
A: Typically 20-40 seconds for the full automated process.

**Q: Can I book multiple properties?**
A: Yes! Use the batch booking script or the interactive interface.

**Q: What if there are no available time slots?**
A: The script will detect this and report it. Try a different property or date.

**Q: Is my data secure?**
A: Yes, all data is stored locally in your SQLite database.

**Q: Can I cancel bookings?**
A: The script automates booking creation. Cancellations must be done through BrokerBay.

---

## 🎉 What's New in Version 2.0

### Enhanced Booking Script
- ✅ Multiple selector strategies for better reliability
- ✅ Auto-confirm slot detection and prioritization
- ✅ Improved error handling with detailed logging
- ✅ Screenshot documentation at every step

### Interactive Interface
- ✅ User-friendly CLI menu system
- ✅ Integrated property search
- ✅ Real-time booking status
- ✅ Export functionality

### Web Dashboard
- ✅ Modern, responsive design
- ✅ Real-time statistics and charts
- ✅ Advanced search and filtering
- ✅ REST API for integrations

### Testing & Reliability
- ✅ Comprehensive test suite
- ✅ Automated health checks
- ✅ Better error recovery
- ✅ Detailed debug output

---

## 🚦 Status

- **Development**: ✅ Complete
- **Testing**: ✅ Complete
- **Documentation**: ✅ Complete
- **Production Ready**: ✅ Yes

---

## 📞 Quick Links

- 📖 **Full Documentation**: [IMPLEMENTATION-GUIDE.md](IMPLEMENTATION-GUIDE.md)
- 🐛 **Troubleshooting**: See [Troubleshooting Section](#-troubleshooting)
- 🧪 **Testing**: See [Testing Section](#-testing)
- 🔧 **Configuration**: See [Configuration Section](#-configuration)
- 📊 **Dashboard**: See [Dashboard Section](#-dashboard)

---

## 📄 License

This project is provided as-is for automation of BrokerBay property bookings.

**Important:** Use responsibly and in compliance with BrokerBay's Terms of Service.

---

## 🙏 Credits

Built with:
- **Puppeteer** - Browser automation
- **Express** - API server
- **Better-SQLite3** - Database
- **Node.js** - Runtime environment

---

**Version**: 2.0.0  
**Last Updated**: November 22, 2025  
**Status**: Production Ready ✅

---

## 🎯 Get Started Now!

```bash
# Quick setup (5 minutes)
npm install
cp .env.example .env
nano .env  # Add your credentials
node test-login.js
node auto-book-enhanced.js <listing_id> "Property Address"
```

**Happy Booking! 🏠🎉**

