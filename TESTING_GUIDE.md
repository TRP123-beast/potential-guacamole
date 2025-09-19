# 🧪 Broker Bay Scraper Testing Guide

## 🚀 Quick Start Testing

### Step 1: Setup Environment
```bash
# 1. Setup environment
./setup_env.sh

# 2. Activate virtual environment
source scrapper/bin/activate

# 3. Install dependencies
pip install -r requirements.txt
```

### Step 2: Verify Broker Bay Login
```bash
# Open Chrome and ensure you're logged in to Broker Bay
# Go to: https://brokerbay.ca
# Login with your credentials
# Keep browser open (optional)
```

### Step 3: Run Tests
```bash
# Run comprehensive test suite
python3 test_scraper.py

# Or run individual tests
python3 main.py search "10 Navy Wharf Court #3209, Toronto, ON"
```

## 📋 Test Scenarios

### 1. **Configuration Test**
```bash
python3 -c "
from config import Config
print('✅ Configuration loaded successfully')
print(f'Use Existing Session: {Config.USE_EXISTING_SESSION}')
print(f'Chrome Profile Path: {Config.CHROME_PROFILE_PATH}')
print(f'Base URL: {Config.BASE_URL}')
"
```

### 2. **Database Test**
```bash
python3 -c "
from data_manager import DataManager
dm = DataManager()
print('✅ Database initialized successfully')
print('✅ Database test passed')
"
```

### 3. **Property Search Test**
```bash
# Test with known Broker Bay properties
python3 main.py search "10 Navy Wharf Court #3209, Toronto, ON"
python3 main.py search "275 Larch Street #G612, Toronto, ON"
python3 main.py search "17 Bathurst Street #4205, Toronto, ON"
```

### 4. **Session Management Test**
```bash
# Test with debug logging to see session status
python3 main.py --log-level DEBUG search "10 Navy Wharf Court #3209, Toronto, ON"
```

### 5. **Data Export Test**
```bash
# After running searches, test data export
python3 main.py list-properties
python3 main.py export properties
python3 main.py export search_history
```

## 🔍 Expected Results

### Successful Test Output
```
🚀 Starting Broker Bay Scraper Tests
==================================================
🧪 Testing configuration...
✅ Configuration test passed
🧪 Testing database operations...
📊 Found 0 properties in database
✅ Database test passed
🤔 Run property search test? This will make actual web requests (y/N): y
🧪 Testing property search...
🔍 Testing: 10 Navy Wharf Court #3209, Toronto, ON
✅ Found: 10 Navy Wharf Court #3209, Toronto, ON
   Price: $XXX,XXX
   ID: PROP_123456
📅 Generated 7 days of schedule
✅ Processed: 10 Navy Wharf Court #3209, Toronto, ON
✅ All tests completed!
```

### Common Issues and Solutions

#### Issue 1: "Chrome profile path not found"
**Solution:**
```bash
# Find your Chrome profile path
ls -la ~/.config/google-chrome/
# Update .env file with correct path
```

#### Issue 2: "No logged-in session detected"
**Solution:**
1. Open Chrome browser
2. Go to brokerbay.ca
3. Login with your credentials
4. Run test again

#### Issue 3: "Property not found"
**Solution:**
1. Verify the address exists on Broker Bay
2. Try different address variations
3. Check if property is currently listed

#### Issue 4: "Chrome driver issues"
**Solution:**
```bash
# Update Chrome driver
pip install --upgrade undetected-chromedriver
# Or install Chrome/Chromium
sudo apt-get install chromium-browser
```

## 📊 Test Data

### Test Properties
- **10 Navy Wharf Court #3209, Toronto, ON**
- **275 Larch Street #G612, Toronto, ON**
- **17 Bathurst Street #4205, Toronto, ON**

### Expected Data Fields
- Property ID
- Address
- Price
- Bedrooms/Bathrooms
- Square footage
- Property type
- Description
- Images
- Showing times

## 🐛 Debug Mode

### Enable Debug Logging
```bash
# Run with debug logging
python3 main.py --log-level DEBUG search "10 Navy Wharf Court #3209, Toronto, ON"
```

### Check Logs
```bash
# View log file
tail -f broker_bay_scraper.log

# View recent logs
tail -20 broker_bay_scraper.log
```

## 🔧 Troubleshooting

### Common Commands
```bash
# Check Python version
python3 --version

# Check virtual environment
which python3

# Check installed packages
pip list

# Check Chrome installation
google-chrome --version
# or
chromium-browser --version
```

### Reset Environment
```bash
# Remove database
rm broker_bay_scraper.db

# Remove logs
rm broker_bay_scraper.log

# Recreate environment
./setup_env.sh
```

## ✅ Success Criteria

A successful test should show:
1. ✅ Configuration loaded without errors
2. ✅ Database initialized successfully
3. ✅ Chrome driver started without errors
4. ✅ Session management working (logged-in status detected)
5. ✅ Property search completed successfully
6. ✅ Property data extracted and saved
7. ✅ 7-day schedule generated
8. ✅ Data export working

## 📈 Performance Expectations

- **Search Time**: 10-30 seconds per property
- **Memory Usage**: < 500MB
- **Success Rate**: > 90% for known properties
- **Error Rate**: < 10% for network issues

## 🚨 Error Handling

The system handles these errors gracefully:
- Network timeouts
- Property not found
- Login session expired
- Chrome driver issues
- Database connection errors

## 📝 Test Reports

After running tests, check:
- `broker_bay_scraper.log` - Detailed execution logs
- `broker_bay_scraper.db` - Database with test data
- Console output - Real-time status updates
