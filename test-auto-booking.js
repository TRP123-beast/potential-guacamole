#!/usr/bin/env node

import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import Database from "better-sqlite3";
import fs from "fs/promises";
import { loginToBrokerBay } from "./src/utils.js";

puppeteer.use(StealthPlugin());
configDotenv();

// ==================== TEST CONFIGURATION ====================
const TEST_CONFIG = {
  headless: false, // Keep visible for debugging
  slowMo: 100,
  timeout: 60000,
  screenshotDir: "src/data/test-screenshots",
  viewport: { width: 1920, height: 1080 }
};

// Test listings - add your own test listing IDs
const TEST_LISTINGS = [
  {
    id: "68c2ccfc7d9f17efa4fc6a0c",
    address: "266 Brant Avenue",
    expectedToHaveSlots: true
  },
  // Add more test listings here
];

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function log(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// ==================== TEST RESULTS TRACKING ====================
class TestRunner {
  constructor() {
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
    this.skipped = 0;
  }

  addTest(name, testFn) {
    this.tests.push({ name, testFn });
  }

  async runTest(test) {
    log(`\n${"=".repeat(70)}`, 'cyan');
    log(`🧪 Test: ${test.name}`, 'cyan');
    log("=".repeat(70), 'cyan');

    try {
      const result = await test.testFn();
      if (result.passed) {
        this.passed++;
        log(`✅ PASSED: ${test.name}`, 'green');
        if (result.message) {
          log(`   ${result.message}`, 'dim');
        }
      } else if (result.skipped) {
        this.skipped++;
        log(`⏭️  SKIPPED: ${test.name}`, 'yellow');
        if (result.message) {
          log(`   ${result.message}`, 'dim');
        }
      } else {
        this.failed++;
        log(`❌ FAILED: ${test.name}`, 'red');
        if (result.message) {
          log(`   ${result.message}`, 'red');
        }
      }
      return result;
    } catch (error) {
      this.failed++;
      log(`❌ FAILED: ${test.name}`, 'red');
      log(`   Error: ${error.message}`, 'red');
      return { passed: false, message: error.message };
    }
  }

  async runAll() {
    log("\n" + "=".repeat(70), 'bright');
    log("🧪 BROKER BAY AUTO-BOOKING TEST SUITE", 'bright');
    log("=".repeat(70) + "\n", 'bright');

    for (const test of this.tests) {
      await this.runTest(test);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Pause between tests
    }

    this.printSummary();
  }

  printSummary() {
    log("\n" + "=".repeat(70), 'bright');
    log("📊 TEST SUMMARY", 'bright');
    log("=".repeat(70), 'bright');
    log(`Total Tests: ${this.tests.length}`, 'white');
    log(`✅ Passed: ${this.passed}`, 'green');
    log(`❌ Failed: ${this.failed}`, 'red');
    log(`⏭️  Skipped: ${this.skipped}`, 'yellow');
    log(`Success Rate: ${((this.passed / this.tests.length) * 100).toFixed(1)}%`, 
        this.failed === 0 ? 'green' : 'yellow');
    log("=".repeat(70) + "\n", 'bright');
  }
}

// ==================== HELPER FUNCTIONS ====================
async function takeScreenshot(page, name) {
  try {
    await fs.mkdir(TEST_CONFIG.screenshotDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filepath = `${TEST_CONFIG.screenshotDir}/${name}_${timestamp}.png`;
    await page.screenshot({ path: filepath, fullPage: true });
    log(`  📸 Screenshot: ${filepath}`, 'dim');
    return filepath;
  } catch (error) {
    log(`  ⚠️ Screenshot failed: ${error.message}`, 'yellow');
    return null;
  }
}

async function createTestBrowser() {
  return await puppeteer.launch({
    headless: TEST_CONFIG.headless,
    slowMo: TEST_CONFIG.slowMo,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    userDataDir: process.env.BROWSER_PROFILE_USERDATA,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--profile-directory=Profile 1",
      "--disable-web-security"
    ]
  });
}

// ==================== TEST CASES ====================

// Test 1: Browser Launch
async function testBrowserLaunch() {
  let browser = null;
  try {
    log("  Launching browser...", 'dim');
    browser = await createTestBrowser();
    const page = await browser.newPage();
    await page.setViewport(TEST_CONFIG.viewport);
    
    log("  Browser launched successfully", 'dim');
    await browser.close();
    
    return { passed: true, message: "Browser launched and closed successfully" };
  } catch (error) {
    if (browser) await browser.close();
    return { passed: false, message: error.message };
  }
}

// Test 2: Login Functionality
async function testLogin() {
  let browser = null;
  try {
    log("  Launching browser...", 'dim');
    browser = await createTestBrowser();
    const page = await browser.newPage();
    await page.setViewport(TEST_CONFIG.viewport);
    
    log("  Attempting login...", 'dim');
    const loginSuccess = await loginToBrokerBay(page);
    
    if (!loginSuccess) {
      await takeScreenshot(page, 'test_login_failed');
      await browser.close();
      return { passed: false, message: "Login failed" };
    }
    
    log("  Verifying login state...", 'dim');
    const url = page.url();
    const isLoggedIn = url.includes('brokerbay.com') && !url.includes('login');
    
    await takeScreenshot(page, 'test_login_success');
    await browser.close();
    
    return { 
      passed: isLoggedIn, 
      message: isLoggedIn ? `Logged in successfully (URL: ${url})` : "Login verification failed"
    };
  } catch (error) {
    if (browser) await browser.close();
    return { passed: false, message: error.message };
  }
}

// Test 3: Navigate to Booking Page
async function testNavigationToBookingPage() {
  if (TEST_LISTINGS.length === 0) {
    return { skipped: true, message: "No test listings configured" };
  }
  
  let browser = null;
  try {
    const testListing = TEST_LISTINGS[0];
    const bookingUrl = `https://edge.brokerbay.com/#/listing/${testListing.id}/appointments/book`;
    
    log("  Launching browser...", 'dim');
    browser = await createTestBrowser();
    const page = await browser.newPage();
    await page.setViewport(TEST_CONFIG.viewport);
    
    log("  Logging in...", 'dim');
    await loginToBrokerBay(page);
    
    log(`  Navigating to booking page: ${testListing.address}`, 'dim');
    await page.goto(bookingUrl, { waitUntil: 'networkidle2', timeout: 90000 });
    await page.waitForTimeout(3000);
    
    await takeScreenshot(page, 'test_booking_page');
    
    const pageContent = await page.content();
    const hasBookingForm = pageContent.includes('Step 1') || 
                          pageContent.includes('name') || 
                          pageContent.includes('email');
    
    await browser.close();
    
    return { 
      passed: hasBookingForm, 
      message: hasBookingForm ? "Booking page loaded successfully" : "Booking form not found"
    };
  } catch (error) {
    if (browser) await browser.close();
    return { passed: false, message: error.message };
  }
}

// Test 4: Form Field Detection
async function testFormFieldDetection() {
  if (TEST_LISTINGS.length === 0) {
    return { skipped: true, message: "No test listings configured" };
  }
  
  let browser = null;
  try {
    const testListing = TEST_LISTINGS[0];
    const bookingUrl = `https://edge.brokerbay.com/#/listing/${testListing.id}/appointments/book`;
    
    log("  Launching browser...", 'dim');
    browser = await createTestBrowser();
    const page = await browser.newPage();
    await page.setViewport(TEST_CONFIG.viewport);
    
    log("  Logging in and navigating...", 'dim');
    await loginToBrokerBay(page);
    await page.goto(bookingUrl, { waitUntil: 'networkidle2', timeout: 90000 });
    await page.waitForTimeout(3000);
    
    log("  Detecting form fields...", 'dim');
    
    // Check for name field
    const nameSelectors = ['input[name="name"]', 'input[ng-model*="name"]', 'input[type="text"]'];
    let nameFound = false;
    for (const selector of nameSelectors) {
      const element = await page.$(selector);
      if (element) {
        nameFound = true;
        log(`    ✓ Name field found: ${selector}`, 'dim');
        break;
      }
    }
    
    // Check for email field
    const emailSelectors = ['input[type="email"]', 'input[name="email"]'];
    let emailFound = false;
    for (const selector of emailSelectors) {
      const element = await page.$(selector);
      if (element) {
        emailFound = true;
        log(`    ✓ Email field found: ${selector}`, 'dim');
        break;
      }
    }
    
    // Check for showing type
    const showingTypeSelectors = ['select[name="showingType"]', 'select[ng-model*="showing"]'];
    let showingTypeFound = false;
    for (const selector of showingTypeSelectors) {
      const element = await page.$(selector);
      if (element) {
        showingTypeFound = true;
        log(`    ✓ Showing type field found: ${selector}`, 'dim');
        break;
      }
    }
    
    await takeScreenshot(page, 'test_form_fields');
    await browser.close();
    
    const allFieldsFound = nameFound && emailFound && showingTypeFound;
    
    return { 
      passed: allFieldsFound, 
      message: allFieldsFound ? 
        "All required form fields detected" : 
        `Missing fields - Name: ${nameFound}, Email: ${emailFound}, ShowingType: ${showingTypeFound}`
    };
  } catch (error) {
    if (browser) await browser.close();
    return { passed: false, message: error.message };
  }
}

// Test 5: Form Filling
async function testFormFilling() {
  if (TEST_LISTINGS.length === 0) {
    return { skipped: true, message: "No test listings configured" };
  }
  
  let browser = null;
  try {
    const testListing = TEST_LISTINGS[0];
    const bookingUrl = `https://edge.brokerbay.com/#/listing/${testListing.id}/appointments/book`;
    
    log("  Launching browser...", 'dim');
    browser = await createTestBrowser();
    const page = await browser.newPage();
    await page.setViewport(TEST_CONFIG.viewport);
    
    log("  Logging in and navigating...", 'dim');
    await loginToBrokerBay(page);
    await page.goto(bookingUrl, { waitUntil: 'networkidle2', timeout: 90000 });
    await page.waitForTimeout(3000);
    
    log("  Filling form fields...", 'dim');
    
    // Fill name
    const nameSelector = 'input[name="name"], input[ng-model*="name"], input[type="text"]';
    const nameInput = await page.$(nameSelector);
    if (nameInput) {
      await nameInput.type("TEST USER - AUTO BOOKING", { delay: 50 });
      log("    ✓ Name filled", 'dim');
    }
    
    // Fill email
    const emailSelector = 'input[type="email"], input[name="email"]';
    const emailInput = await page.$(emailSelector);
    if (emailInput) {
      await emailInput.type("test@example.com", { delay: 50 });
      log("    ✓ Email filled", 'dim');
    }
    
    // Select showing type
    const showingTypeSelector = 'select[name="showingType"], select[ng-model*="showing"]';
    const showingTypeSelect = await page.$(showingTypeSelector);
    if (showingTypeSelect) {
      const options = await page.evaluate((sel) => {
        const select = document.querySelector(sel);
        return Array.from(select.options).map(opt => opt.value);
      }, showingTypeSelector);
      
      if (options.length > 0) {
        await page.select(showingTypeSelector, options[0]);
        log("    ✓ Showing type selected", 'dim');
      }
    }
    
    await page.waitForTimeout(1000);
    await takeScreenshot(page, 'test_form_filled');
    
    // Verify values were set
    const nameValue = await page.$eval(nameSelector, el => el.value).catch(() => '');
    const emailValue = await page.$eval(emailSelector, el => el.value).catch(() => '');
    
    await browser.close();
    
    const formFilled = nameValue.includes("TEST USER") && emailValue === "test@example.com";
    
    return { 
      passed: formFilled, 
      message: formFilled ? 
        "Form filled successfully" : 
        `Form filling incomplete - Name: ${nameValue}, Email: ${emailValue}`
    };
  } catch (error) {
    if (browser) await browser.close();
    return { passed: false, message: error.message };
  }
}

// Test 6: Calendar and Date Detection
async function testCalendarDetection() {
  if (TEST_LISTINGS.length === 0) {
    return { skipped: true, message: "No test listings configured" };
  }
  
  let browser = null;
  try {
    const testListing = TEST_LISTINGS[0];
    const bookingUrl = `https://edge.brokerbay.com/#/listing/${testListing.id}/appointments/book`;
    
    log("  Launching browser...", 'dim');
    browser = await createTestBrowser();
    const page = await browser.newPage();
    await page.setViewport(TEST_CONFIG.viewport);
    
    log("  Logging in and navigating...", 'dim');
    await loginToBrokerBay(page);
    await page.goto(bookingUrl, { waitUntil: 'networkidle2', timeout: 90000 });
    await page.waitForTimeout(3000);
    
    log("  Looking for calendar...", 'dim');
    
    // Look for calendar elements
    const calendarSelectors = [
      '.calendar',
      '[class*="calendar"]',
      'table.month',
      'td.day',
      '[class*="date-picker"]'
    ];
    
    let calendarFound = false;
    let availableDates = 0;
    
    for (const selector of calendarSelectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        calendarFound = true;
        log(`    ✓ Calendar found: ${selector} (${elements.length} elements)`, 'dim');
        
        // Count available dates
        if (selector.includes('day')) {
          availableDates = elements.length;
        }
        break;
      }
    }
    
    await takeScreenshot(page, 'test_calendar');
    await browser.close();
    
    return { 
      passed: calendarFound, 
      message: calendarFound ? 
        `Calendar detected with ${availableDates} date elements` : 
        "Calendar not found"
    };
  } catch (error) {
    if (browser) await browser.close();
    return { passed: false, message: error.message };
  }
}

// Test 7: Time Slot Detection
async function testTimeSlotDetection() {
  if (TEST_LISTINGS.length === 0) {
    return { skipped: true, message: "No test listings configured" };
  }
  
  let browser = null;
  try {
    const testListing = TEST_LISTINGS[0];
    const bookingUrl = `https://edge.brokerbay.com/#/listing/${testListing.id}/appointments/book`;
    
    log("  Launching browser...", 'dim');
    browser = await createTestBrowser();
    const page = await browser.newPage();
    await page.setViewport(TEST_CONFIG.viewport);
    
    log("  Logging in and navigating...", 'dim');
    await loginToBrokerBay(page);
    await page.goto(bookingUrl, { waitUntil: 'networkidle2', timeout: 90000 });
    await page.waitForTimeout(3000);
    
    log("  Looking for available time slots (need to select date first)...", 'dim');
    
    // Try to click a date first
    const dateSelectors = ['td.today:not(.disabled)', 'td.day:not(.disabled)'];
    for (const selector of dateSelectors) {
      const dates = await page.$$(selector);
      if (dates.length > 0) {
        await dates[0].click();
        await page.waitForTimeout(2000);
        log("    ✓ Date clicked", 'dim');
        break;
      }
    }
    
    // Now look for time slots
    const timeSlotSelectors = [
      'button[class*="time"]:not([disabled])',
      '.time-slot:not(.disabled)',
      '[class*="slot"]:not([disabled])'
    ];
    
    let timeSlotsFound = false;
    let slotCount = 0;
    let autoConfirmSlots = 0;
    
    for (const selector of timeSlotSelectors) {
      const slots = await page.$$(selector);
      if (slots.length > 0) {
        timeSlotsFound = true;
        slotCount = slots.length;
        log(`    ✓ Time slots found: ${selector} (${slotCount} slots)`, 'dim');
        
        // Check for auto-confirm slots
        for (const slot of slots) {
          const isAutoConfirm = await page.evaluate((el) => {
            const classes = el.className.toLowerCase();
            const text = (el.textContent || '').toLowerCase();
            return classes.includes('green') || classes.includes('auto') || text.includes('auto');
          }, slot);
          
          if (isAutoConfirm) autoConfirmSlots++;
        }
        
        break;
      }
    }
    
    if (autoConfirmSlots > 0) {
      log(`    ✓ Found ${autoConfirmSlots} auto-confirm slots`, 'green');
    }
    
    await takeScreenshot(page, 'test_time_slots');
    await browser.close();
    
    return { 
      passed: timeSlotsFound, 
      message: timeSlotsFound ? 
        `Found ${slotCount} time slots (${autoConfirmSlots} auto-confirm)` : 
        "No time slots found"
    };
  } catch (error) {
    if (browser) await browser.close();
    return { passed: false, message: error.message };
  }
}

// Test 8: Database Connection
async function testDatabaseConnection() {
  try {
    log("  Testing database connection...", 'dim');
    
    const db = new Database("src/data/data.db");
    
    // Test query
    const result = db.prepare("SELECT COUNT(*) as count FROM bookings").get();
    
    log(`    ✓ Database connected (${result.count} bookings found)`, 'dim');
    
    db.close();
    
    return { passed: true, message: `Database accessible with ${result.count} existing bookings` };
  } catch (error) {
    return { passed: false, message: error.message };
  }
}

// Test 9: Screenshot Directory Creation
async function testScreenshotDirectory() {
  try {
    log("  Testing screenshot directory creation...", 'dim');
    
    await fs.mkdir(TEST_CONFIG.screenshotDir, { recursive: true });
    const stats = await fs.stat(TEST_CONFIG.screenshotDir);
    
    if (stats.isDirectory()) {
      log(`    ✓ Screenshot directory exists: ${TEST_CONFIG.screenshotDir}`, 'dim');
      return { passed: true, message: "Screenshot directory accessible" };
    } else {
      return { passed: false, message: "Path exists but is not a directory" };
    }
  } catch (error) {
    return { passed: false, message: error.message };
  }
}

// Test 10: Environment Variables
async function testEnvironmentVariables() {
  log("  Checking environment variables...", 'dim');
  
  const requiredVars = [
    'BROWSER_EXECUTABLE_PATH',
    'BROWSER_PROFILE_USERDATA'
  ];
  
  const optionalVars = [
    'USER_NAME',
    'USER_EMAIL',
    'SHOWING_TYPE',
    'PREFERRED_DURATION'
  ];
  
  const missing = [];
  const present = [];
  
  for (const varName of requiredVars) {
    if (process.env[varName]) {
      present.push(varName);
      log(`    ✓ ${varName}: Set`, 'dim');
    } else {
      missing.push(varName);
      log(`    ✗ ${varName}: Not set`, 'yellow');
    }
  }
  
  for (const varName of optionalVars) {
    if (process.env[varName]) {
      log(`    ✓ ${varName}: ${process.env[varName]}`, 'dim');
    } else {
      log(`    ⚠ ${varName}: Not set (will use default)`, 'dim');
    }
  }
  
  return { 
    passed: missing.length === 0, 
    message: missing.length === 0 ? 
      "All required environment variables set" : 
      `Missing: ${missing.join(', ')}`
  };
}

// ==================== RUN ALL TESTS ====================
async function runAllTests() {
  const runner = new TestRunner();
  
  // Add all tests
  runner.addTest("Browser Launch", testBrowserLaunch);
  runner.addTest("Environment Variables", testEnvironmentVariables);
  runner.addTest("Database Connection", testDatabaseConnection);
  runner.addTest("Screenshot Directory", testScreenshotDirectory);
  runner.addTest("Login Functionality", testLogin);
  runner.addTest("Navigate to Booking Page", testNavigationToBookingPage);
  runner.addTest("Form Field Detection", testFormFieldDetection);
  runner.addTest("Form Filling", testFormFilling);
  runner.addTest("Calendar Detection", testCalendarDetection);
  runner.addTest("Time Slot Detection", testTimeSlotDetection);
  
  await runner.runAll();
  
  // Exit with appropriate code
  process.exit(runner.failed > 0 ? 1 : 0);
}

// ==================== MAIN ====================
runAllTests().catch(console.error);

