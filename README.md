# Broker Bay Property Scraper

A comprehensive web scraping solution for Canadian real estate properties from Broker Bay, built with Node.js, Puppeteer, and SQLite. This tool can scrape property listings, extract detailed information, monitor price changes, and manage showing schedules.

## 🏠 Features

### Core Functionality
- **Property Listings Scraping**: Automatically scrape property listings from Broker Bay search results
- **Detailed Property Information**: Extract comprehensive property details including price, bedrooms, bathrooms, square footage, MLS number, agent information, and more
- **Showing Schedule Management**: View available showing times and book appointments
- **Price Change Monitoring**: Track price changes over time with notifications
- **Real-time Notifications**: Get alerts for new listings, price drops, and status changes
- **Database Storage**: Local SQLite database with cloud sync capability (Supabase)

### Data Extracted
- Property address and basic details
- Pricing information and price history
- Property specifications (bedrooms, bathrooms, square footage)
- MLS number and agent contact information
- Property description and features
- Showing schedules and availability
- Property status and listing dates

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- Chrome browser installed
- Broker Bay account (for logged-in features)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd broker-bay-scraper
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env` file in the root directory:
   ```env
   BROWSER_EXECUTABLE_PATH=/path/to/chrome
   BROWSER_PROFILE_USERDATA=/path/to/chrome/profile
   API_URL=http://localhost:3000
   CONTACT_NAME=Your Name
   CONTACT_EMAIL=your.email@example.com
   CONTACT_PHONE=555-1234
   SUPABASE_PROJECT_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_key
   ```

4. **Start the server**
   ```bash
   npm run dev
   # or
   npm run server
   ```

The server will start on `http://localhost:3000`

## 📊 Database Schema

### Properties Table
```sql
CREATE TABLE properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id TEXT UNIQUE,
  address TEXT,
  price INTEGER,
  price_change INTEGER DEFAULT 0,
  status TEXT,
  bedrooms INTEGER,
  bathrooms INTEGER,
  sqft INTEGER,
  listing_date TEXT,
  last_updated TEXT,
  mls_number TEXT,
  agent TEXT,
  agent_phone TEXT,
  description TEXT,
  features TEXT,
  url TEXT,
  property_type TEXT,
  year_built INTEGER,
  lot_size TEXT,
  parking_spaces INTEGER
);
```

### Price Changes Table
```sql
CREATE TABLE price_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id TEXT,
  old_price INTEGER,
  new_price INTEGER,
  change_amount INTEGER,
  change_percentage REAL,
  timestamp TEXT,
  FOREIGN KEY(property_id) REFERENCES properties(property_id)
);
```

### Notifications Table
```sql
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id TEXT,
  notification_type TEXT,
  content TEXT,
  timestamp TEXT,
  UNIQUE(property_id, notification_type, timestamp)
);
```

## 🔧 API Endpoints

### Property Management
- `GET /properties` - Get all properties
- `GET /properties/:id` - Get specific property by ID
- `GET /properties/search/:address` - Search properties by address

### Property Scraping
- `POST /properties/scrape` - Scrape properties by address
  ```json
  {
    "address": "101 Lake Drive N"
  }
  ```
- `POST /properties/details` - Get detailed property information
  ```json
  {
    "url": "https://brokerbay.ca/property/123456"
  }
  ```

### Showing Schedules
- `POST /properties/showing/schedule` - Get available showing times
- `POST /properties/showing/book` - Book a showing appointment
  ```json
  {
    "url": "https://brokerbay.ca/property/123456",
    "dateTime": "2025-01-25 2:00 PM"
  }
  ```

### Monitoring
- `POST /monitor/start` - Start property monitoring
- `POST /monitor/stop` - Stop property monitoring

## 🧪 Testing

### Test Specific Properties
```bash
node src/test/test-properties.js
```

This will test scraping for the predefined properties:
- 101 Lake Drive N
- 10 Navy Wharf Court #3209

### Manual Testing
1. **Start the server**: `npm run dev`
2. **Test property scraping**:
   ```bash
   curl -X POST http://localhost:3000/properties/scrape \
     -H "Content-Type: application/json" \
     -d '{"address": "101 Lake Drive N"}'
   ```
3. **Get all properties**:
   ```bash
   curl http://localhost:3000/properties
   ```

## 📁 Project Structure

```
src/
├── index.js                    # Main server and API endpoints
├── ReadAndSaveData.js         # Database operations
├── utils.js                   # Utility functions
├── SupabaseClient.js          # Cloud database client
├── property-scraper/          # Scraping modules
│   ├── ReadPropertyListings.js
│   ├── ReadPropertyDetails.js
│   └── ReadShowingSchedules.js
├── property-monitors/         # Monitoring modules
│   ├── ListenForNewListings.js
│   └── ListenForPriceChanges.js
├── test/                      # Test files
│   └── test-properties.js
└── data/                      # Data storage
    ├── data.db               # SQLite database
    └── DataSync.js          # Cloud sync functions
```

## 🔄 How It Works

### 1. Property Discovery
- Navigate to Broker Bay search page
- Search for specific addresses or browse listings
- Extract basic property information from search results

### 2. Detailed Information Extraction
- Visit individual property pages
- Extract comprehensive property details
- Parse pricing, specifications, and agent information

### 3. Showing Schedule Management
- Click "Book Showing" buttons
- Extract available time slots
- Handle booking forms and confirmations

### 4. Data Storage and Management
- Store properties in SQLite database
- Track price changes over time
- Generate notifications for important events

### 5. Monitoring and Alerts
- Continuously monitor for new listings
- Track price changes on existing properties
- Send notifications for significant events

## 🛡️ Anti-Detection Features

- **Stealth Mode**: Uses puppeteer-extra with stealth plugin
- **User Profile**: Maintains logged-in Chrome profile
- **Random Delays**: Implements random wait times between actions
- **Realistic Behavior**: Mimics human browsing patterns

## 📈 Monitoring and Notifications

### New Listing Alerts
- Automatically detects new property listings
- Sends notifications with property details
- Tracks listing dates and times

### Price Change Monitoring
- Monitors existing properties for price changes
- Calculates price change percentages
- Records price history in database

### Status Updates
- Tracks property status changes (Active, Sold, Pending)
- Notifies when properties are no longer available

## 🔧 Configuration

### Browser Settings
- Uses your existing Chrome profile for authentication
- Maintains login sessions across scraping sessions
- Configurable browser executable path

### Rate Limiting
- Implements delays between requests
- Respects website rate limits
- Configurable polling intervals

### Data Export
- Export property data to JSON files
- SQLite database for local storage
- Supabase integration for cloud backup

## 🚨 Important Notes

### Legal Compliance
- Respects robots.txt and terms of service
- Implements reasonable rate limiting
- Uses only publicly available information

### Browser Requirements
- Requires Chrome browser installation
- Uses your logged-in Broker Bay profile
- Maintains session state across runs

### Data Accuracy
- Property information is scraped in real-time
- Prices and availability may change frequently
- Always verify information before making decisions

## 🐛 Troubleshooting

### Common Issues

1. **Browser not found**
   - Ensure Chrome is installed
   - Check BROWSER_EXECUTABLE_PATH in .env

2. **Login required**
   - Make sure you're logged into Broker Bay in Chrome
   - Check BROWSER_PROFILE_USERDATA path

3. **Scraping fails**
   - Website structure may have changed
   - Check console logs for specific errors
   - Verify selectors in scraping modules

4. **Database errors**
   - Ensure SQLite database is writable
   - Check file permissions in data/ directory

### Debug Mode
Enable debug logging by setting:
```env
DEBUG=true
```

## 📝 License

This project is licensed under the ISC License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For issues and questions:
1. Check the troubleshooting section
2. Review console logs for errors
3. Create an issue with detailed information

---

**Disclaimer**: This tool is for educational and personal use only. Always respect website terms of service and implement appropriate rate limiting. The authors are not responsible for any misuse of this software.