#!/usr/bin/env node

import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import Database from "better-sqlite3";
import fs from "fs/promises";
import { loginToBrokerBay, waitFor } from "./src/utils.js";

puppeteer.use(StealthPlugin());
configDotenv();

// ==================== CONFIGURATION ====================
const CONFIG = {
  headless: process.env.HEADLESS !== "false",
  slowMo: parseInt(process.env.SLOW_MO || "100"),
  timeout: 60000,
  screenshotDir: "src/data/screenshots",
  viewport: { width: 1920, height: 1080 },
  navigationTimeout: 90000,
  waitAfterAction: 1500
};

// User profile configuration
const USER_PROFILE = {
  name: process.env.USER_NAME || "NAHEED VALYANI",
  email: process.env.USER_EMAIL || "naheed.val@gmail.com",
  organization: process.env.USER_ORGANIZATION || "HOMELIFE/YORKLAND REAL ESTATE LTD.",
  showingType: process.env.SHOWING_TYPE || "Buyer/Broker",
  preferredDuration: parseInt(process.env.PREFERRED_DURATION || "60"),
  notes: process.env.BOOKING_NOTES || "",
  autoConfirmOnly: process.env.AUTO_CONFIRM_ONLY === "true"
};

// ==================== CLI ARGUMENT PARSING ====================
const args = process.argv.slice(2);
let listingId = args[0];
let propertyAddress = args[1] || "Property";

if (!listingId) {
  console.error("\n❌ Error: Please provide a listing ID");
  console.log("\nUsage: node auto-book-enhanced.js <listing_id> [property_address]");
  console.log("Example: node auto-book-enhanced.js 68c2ccfc7d9f17efa4fc6a0c '266 Brant Avenue'\n");
  process.exit(1);
}

const BOOKING_URL = `https://edge.brokerbay.com/#/listing/${listingId}/appointments/book`;

// ==================== ANSI COLORS ====================
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function log(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message, status = 'info') {
  const icons = { info: '🔍', success: '✅', error: '❌', warning: '⚠️' };
  const statusColors = { info: 'cyan', success: 'green', error: 'red', warning: 'yellow' };
  log(`${icons[status]} Step ${step}: ${message}`, statusColors[status]);
}

// ==================== DATABASE OPERATIONS ====================
function setupDatabase() {
  const db = new Database("src/data/data.db");
  try { db.pragma('foreign_keys = OFF'); } catch { db.exec("PRAGMA foreign_keys = OFF"); }
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
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
  `);
  return db;
}

function saveBooking(bookingData) {
  const db = setupDatabase();
  try {
    const stmt = db.prepare(`
      INSERT INTO bookings (
        listing_id, property_address, booking_date, booking_time, duration, 
        user_name, user_email, organization, showing_type, status, 
        auto_confirmed, booking_url, screenshot_path, confirmation_message
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    
    const info = stmt.run(
      bookingData.listing_id,
      bookingData.property_address,
      bookingData.booking_date,
      bookingData.booking_time,
      bookingData.duration,
      bookingData.user_name,
      bookingData.user_email,
      bookingData.organization,
      bookingData.showing_type,
      bookingData.status,
      bookingData.auto_confirmed ? 1 : 0,
      bookingData.booking_url,
      bookingData.screenshot_path || null,
      bookingData.confirmation_message || null
    );
    
    return info.lastInsertRowid;
  } catch (error) {
    console.error(`Database error: ${error.message}`);
    return null;
  } finally {
    db.close();
  }
}

// ==================== SCREENSHOT UTILITY ====================
async function takeScreenshot(page, name) {
  try {
    await fs.mkdir(CONFIG.screenshotDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filepath = `${CONFIG.screenshotDir}/${name}_${timestamp}.png`;
    await page.screenshot({ path: filepath, fullPage: true });
    log(`  📸 Screenshot: ${filepath}`, 'dim');
    return filepath;
  } catch (error) {
    log(`  ⚠️ Screenshot failed: ${error.message}`, 'yellow');
    return null;
  }
}

// ==================== ELEMENT DETECTION HELPERS ====================
async function waitForElement(page, selector, timeout = 10000) {
  try {
    await page.waitForSelector(selector, { timeout, visible: true });
    return true;
  } catch (error) {
    return false;
  }
}

async function safeClick(page, selector, description = "element") {
  try {
    await page.waitForSelector(selector, { timeout: 10000, visible: true });
    await page.click(selector);
    log(`  ✓ Clicked ${description}`, 'dim');
    await page.waitForTimeout(CONFIG.waitAfterAction);
    return true;
  } catch (error) {
    log(`  ⚠️ Failed to click ${description}: ${error.message}`, 'yellow');
    return false;
  }
}

async function safeType(page, selector, text, description = "field") {
  try {
    await page.waitForSelector(selector, { timeout: 10000, visible: true });
    await page.click(selector, { clickCount: 3 }); // Select all existing text
    await page.type(selector, text, { delay: 50 });
    log(`  ✓ Entered ${description}: ${text}`, 'dim');
    return true;
  } catch (error) {
    log(`  ⚠️ Failed to type in ${description}: ${error.message}`, 'yellow');
    return false;
  }
}

async function safeSelect(page, selector, value, description = "option") {
  try {
    await page.waitForSelector(selector, { timeout: 10000, visible: true });
    await page.select(selector, value);
    log(`  ✓ Selected ${description}: ${value}`, 'dim');
    return true;
  } catch (error) {
    log(`  ⚠️ Failed to select ${description}: ${error.message}`, 'yellow');
    return false;
  }
}

// ==================== STEP 1: FILL PROFILE ====================
async function fillProfileStep(page) {
  logStep(1, "Filling profile information (Step 1 - Your Profile)", 'info');
  
  await page.waitForTimeout(2000); // Wait for form to render
  
  // Name field - try multiple selectors
  const nameSelectors = [
    'input[name="name"]',
    'input[ng-model*="name"]',
    'input[placeholder*="Name"]',
    'input[type="text"]'
  ];
  
  let nameEntered = false;
  for (const selector of nameSelectors) {
    if (await safeType(page, selector, USER_PROFILE.name, "name")) {
      nameEntered = true;
      break;
    }
  }
  
  if (!nameEntered) {
    throw new Error("Could not find name input field");
  }
  
  // Email field
  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[ng-model*="email"]',
    'input[placeholder*="email" i]'
  ];
  
  let emailEntered = false;
  for (const selector of emailSelectors) {
    if (await safeType(page, selector, USER_PROFILE.email, "email")) {
      emailEntered = true;
      break;
    }
  }
  
  if (!emailEntered) {
    throw new Error("Could not find email input field");
  }
  
  // Showing Type dropdown
  const showingTypeSelectors = [
    'select[name="showingType"]',
    'select[ng-model*="showing"]',
    'select[ng-model*="type"]'
  ];
  
  for (const selector of showingTypeSelectors) {
    const element = await page.$(selector);
    if (element) {
      // Get all options to find the right value
      const options = await page.evaluate((sel) => {
        const select = document.querySelector(sel);
        return Array.from(select.options).map(opt => ({
          value: opt.value,
          text: opt.text
        }));
      }, selector);
      
      log(`  Available showing types: ${options.map(o => o.text).join(', ')}`, 'dim');
      
      // Find matching option
      const matchingOption = options.find(opt => 
        opt.text.includes('Buyer') || opt.value.includes('Buyer')
      );
      
      if (matchingOption) {
        await page.select(selector, matchingOption.value);
        log(`  ✓ Selected showing type: ${matchingOption.text}`, 'dim');
        break;
      }
    }
  }
  
  await takeScreenshot(page, '01_profile_filled');
  logStep(1, "Profile information filled successfully", 'success');
}

// ==================== STEP 2: SELECT DATE ====================
async function selectDateStep(page) {
  logStep(2, "Selecting available date (Step 2 - Select Date)", 'info');
  
  await page.waitForTimeout(2000); // Wait for calendar to load
  
  // Look for the current date indicator (today's date with "22" visible in screenshot)
  const dateSelectors = [
    'td.today:not(.disabled):not(.old)',
    'td.day:not(.disabled):not(.old).today',
    'button[class*="today"]:not([disabled])',
    '.calendar-day.today:not(.disabled)'
  ];
  
  let dateSelected = false;
  
  // Try to click today's date first
  for (const selector of dateSelectors) {
    const elements = await page.$$(selector);
    if (elements.length > 0) {
      log(`  Found today's date`, 'dim');
      try {
        await elements[0].click();
        await page.waitForTimeout(2000); // Wait for time slots to load
        dateSelected = true;
        log(`  ✓ Selected today's date`, 'dim');
        break;
      } catch (error) {
        continue;
      }
    }
  }
  
  // If today didn't work, try any available future date
  if (!dateSelected) {
    const availableDateSelectors = [
      'td.day:not(.disabled):not(.old):not(.new)',
      'button[class*="date"]:not([disabled])',
      '.calendar-day:not(.disabled)',
      'td.available'
    ];
    
    for (const selector of availableDateSelectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        log(`  Found ${elements.length} available dates`, 'dim');
        
        // Try clicking the first few dates
        for (let i = 0; i < Math.min(elements.length, 3); i++) {
          try {
            await elements[i].click();
            await page.waitForTimeout(2000);
            
            // Check if time slots appeared
            const timeSlotsExist = await page.$('.time-slot, [class*="time"], button[class*="slot"]');
            if (timeSlotsExist) {
              dateSelected = true;
              log(`  ✓ Date selected successfully`, 'dim');
              break;
            }
          } catch (error) {
            continue;
          }
        }
        
        if (dateSelected) break;
      }
    }
  }
  
  if (!dateSelected) {
    throw new Error("Could not select a date - no available dates found");
  }
  
  await takeScreenshot(page, '02_date_selected');
  logStep(2, "Date selected successfully", 'success');
  
  return dateSelected;
}

// ==================== STEP 3: SELECT TIME AND DURATION ====================
async function selectTimeAndDurationStep(page) {
  logStep(3, "Selecting time slot and duration (Step 3 - Select Time)", 'info');
  
  await page.waitForTimeout(2000); // Wait for time slots to render
  
  // First, select duration if available
  const durationSelectors = [
    `input[type="radio"][value="${USER_PROFILE.preferredDuration}"]`,
    `input[type="radio"][name*="duration"]`
  ];
  
  log(`  Looking for ${USER_PROFILE.preferredDuration} minute duration option...`, 'dim');
  
  let durationSet = false;
  for (const selector of durationSelectors) {
    const radios = await page.$$(selector);
    
    for (const radio of radios) {
      try {
        const value = await page.evaluate(el => el.value, radio);
        const label = await page.evaluate(el => {
          const labelElement = el.closest('label') || el.parentElement;
          return labelElement ? labelElement.textContent : '';
        }, radio);
        
        if (value == USER_PROFILE.preferredDuration || label.includes(USER_PROFILE.preferredDuration.toString())) {
          await radio.click();
          await page.waitForTimeout(1500); // Wait for time slots to update
          log(`  ✓ Selected duration: ${USER_PROFILE.preferredDuration} minutes`, 'dim');
          durationSet = true;
          break;
        }
      } catch (error) {
        continue;
      }
    }
    
    if (durationSet) break;
  }
  
  // Now select time slot
  await page.waitForTimeout(1500);
  
  // Get all available time slots
  const timeSlotSelectors = [
    'button[class*="time"]:not([disabled])',
    '.time-slot:not(.disabled):not(.booked)',
    '[class*="slot"]:not([disabled])',
    'div[class*="time"][class*="available"]',
    'button[ng-click*="time"]'
  ];
  
  let selectedSlot = null;
  let autoConfirm = false;
  
  for (const selector of timeSlotSelectors) {
    const slots = await page.$$(selector);
    
    if (slots.length > 0) {
      log(`  Found ${slots.length} available time slots`, 'dim');
      
      // Analyze each slot for auto-confirm capability
      const slotData = [];
      
      for (let i = 0; i < slots.length; i++) {
        try {
          const data = await page.evaluate((el) => {
            const text = el.textContent || el.innerText;
            const classes = el.className;
            const style = window.getComputedStyle(el);
            const bgColor = style.backgroundColor;
            
            // Check for green color or auto-confirm indicators
            const isAutoConfirm = 
              classes.toLowerCase().includes('green') ||
              classes.toLowerCase().includes('auto') ||
              text.toLowerCase().includes('auto') ||
              bgColor.includes('0, 128, 0') || // green RGB
              bgColor.includes('green');
            
            return {
              text: text.trim(),
              classes: classes,
              isAutoConfirm: isAutoConfirm
            };
          }, slots[i]);
          
          slotData.push({ index: i, element: slots[i], ...data });
        } catch (error) {
          continue;
        }
      }
      
      // Display available slots
      log(`\n  Available time slots:`, 'cyan');
      slotData.forEach((slot, idx) => {
        const autoConfirmMarker = slot.isAutoConfirm ? ' [AUTO-CONFIRM]' : '';
        log(`    ${idx + 1}. ${slot.text}${autoConfirmMarker}`, slot.isAutoConfirm ? 'green' : 'white');
      });
      
      // Prefer auto-confirm slots if configured
      if (USER_PROFILE.autoConfirmOnly) {
        const autoConfirmSlots = slotData.filter(s => s.isAutoConfirm);
        if (autoConfirmSlots.length > 0) {
          selectedSlot = autoConfirmSlots[0];
          autoConfirm = true;
          log(`\n  Selected AUTO-CONFIRM slot: ${selectedSlot.text}`, 'green');
        } else {
          throw new Error("No auto-confirm slots available (AUTO_CONFIRM_ONLY is enabled)");
        }
      } else {
        // Try to get auto-confirm first, otherwise take the first available
        const autoConfirmSlots = slotData.filter(s => s.isAutoConfirm);
        if (autoConfirmSlots.length > 0) {
          selectedSlot = autoConfirmSlots[0];
          autoConfirm = true;
          log(`\n  Selected AUTO-CONFIRM slot: ${selectedSlot.text}`, 'green');
        } else {
          selectedSlot = slotData[0];
          log(`\n  Selected regular slot: ${selectedSlot.text}`, 'cyan');
        }
      }
      
      // Click the selected slot
      if (selectedSlot) {
        await selectedSlot.element.click();
        await page.waitForTimeout(CONFIG.waitAfterAction);
        log(`  ✓ Time slot clicked`, 'dim');
        break;
      }
    }
  }
  
  if (!selectedSlot) {
    throw new Error("No available time slots found");
  }
  
  await takeScreenshot(page, '03_time_selected');
  logStep(3, "Time and duration selected successfully", 'success');
  
  return {
    time: selectedSlot.text,
    duration: `${USER_PROFILE.preferredDuration} minutes`,
    autoConfirm: autoConfirm
  };
}

// ==================== STEP 4: SUBMIT BOOKING ====================
async function submitBooking(page) {
  logStep(4, "Submitting booking", 'info');
  
  await page.waitForTimeout(1500);
  
  // Look for AUTO-CONFIRM or Book Showing button
  const submitSelectors = [
    'button:contains("AUTO-CONFIRM")',
    'button:contains("Book Showing")',
    'button:contains("Confirm")',
    'button[type="submit"]',
    'button[class*="submit"]',
    'button[class*="confirm"]',
    'button[ng-click*="submit"]',
    'button[ng-click*="book"]'
  ];
  
  let submitted = false;
  let buttonText = '';
  
  // Try XPath for text matching
  const autoConfirmButton = await page.$x("//button[contains(text(), 'AUTO-CONFIRM') or contains(text(), 'Auto-Confirm')]");
  if (autoConfirmButton.length > 0) {
    buttonText = await page.evaluate(el => el.textContent, autoConfirmButton[0]);
    log(`  Found AUTO-CONFIRM button`, 'green');
    await autoConfirmButton[0].click();
    submitted = true;
  }
  
  // Try Book Showing button
  if (!submitted) {
    const bookButton = await page.$x("//button[contains(text(), 'Book Showing') or contains(text(), 'Book')]");
    if (bookButton.length > 0) {
      buttonText = await page.evaluate(el => el.textContent, bookButton[0]);
      log(`  Found Book button`, 'cyan');
      await bookButton[0].click();
      submitted = true;
    }
  }
  
  // Try standard selectors
  if (!submitted) {
    for (const selector of submitSelectors) {
      const buttons = await page.$$(selector);
      for (const button of buttons) {
        try {
          const text = await page.evaluate(el => el.textContent || el.value, button);
          if (text && (text.toLowerCase().includes('book') || 
                       text.toLowerCase().includes('confirm') ||
                       text.toLowerCase().includes('submit'))) {
            buttonText = text.trim();
            await button.click();
            submitted = true;
            break;
          }
        } catch (error) {
          continue;
        }
      }
      if (submitted) break;
    }
  }
  
  if (!submitted) {
    throw new Error("Could not find submit/book button");
  }
  
  log(`  ✓ Clicked: ${buttonText}`, 'dim');
  await page.waitForTimeout(3000); // Wait for confirmation
  
  await takeScreenshot(page, '04_booking_submitted');
  logStep(4, "Booking submitted successfully", 'success');
  
  return buttonText;
}

// ==================== STEP 5: VERIFY CONFIRMATION ====================
async function verifyConfirmation(page) {
  logStep(5, "Verifying booking confirmation", 'info');
  
  await page.waitForTimeout(2500);
  
  // Look for success/confirmation indicators
  const successSelectors = [
    '.success',
    '.confirmation',
    '.alert-success',
    '[class*="success"]',
    '[class*="confirm"]',
    '[class*="complete"]'
  ];
  
  let confirmationMessage = '';
  let isConfirmed = false;
  
  // Check for success messages
  for (const selector of successSelectors) {
    const element = await page.$(selector);
    if (element) {
      const text = await page.evaluate(el => el.textContent, element);
      if (text && (text.toLowerCase().includes('confirm') || 
                   text.toLowerCase().includes('success') ||
                   text.toLowerCase().includes('booked'))) {
        confirmationMessage = text.trim();
        isConfirmed = true;
        break;
      }
    }
  }
  
  // Alternative: check URL change or page content
  if (!isConfirmed) {
    const pageContent = await page.content();
    if (pageContent.toLowerCase().includes('successfully') ||
        pageContent.toLowerCase().includes('confirmed')) {
      isConfirmed = true;
      confirmationMessage = 'Booking appears successful (detected in page content)';
    }
  }
  
  // Check if we're back to dashboard or confirmation page
  const currentUrl = page.url();
  if (currentUrl.includes('success') || currentUrl.includes('confirmation')) {
    isConfirmed = true;
    confirmationMessage = 'Redirected to confirmation page';
  }
  
  await takeScreenshot(page, '05_confirmation');
  
  if (isConfirmed) {
    logStep(5, "Booking confirmed!", 'success');
    log(`  ${confirmationMessage}`, 'green');
  } else {
    logStep(5, "Confirmation status unclear - may require manual verification", 'warning');
    confirmationMessage = 'Pending manual verification';
  }
  
  return {
    isConfirmed: isConfirmed,
    message: confirmationMessage
  };
}

// ==================== MAIN AUTO-BOOKING FUNCTION ====================
async function autoBookShowing() {
  let browser = null;
  let bookingResult = {
    success: false,
    error: null,
    bookingId: null
  };
  
  try {
    console.clear();
    log("\n" + "=".repeat(70), 'cyan');
    log("  🤖 BROKER BAY ENHANCED AUTO-BOOKING SCRIPT", 'cyan');
    log("=".repeat(70) + "\n", 'cyan');
    log(`Property: ${propertyAddress}`, 'bright');
    log(`Listing ID: ${listingId}`, 'bright');
    log(`User: ${USER_PROFILE.name} (${USER_PROFILE.email})`, 'dim');
    log(`Preferred Duration: ${USER_PROFILE.preferredDuration} minutes`, 'dim');
    log(`Auto-Confirm Only: ${USER_PROFILE.autoConfirmOnly ? 'YES' : 'NO'}`, 'dim');
    log(`\nBooking URL: ${BOOKING_URL}\n`, 'dim');
    
    // Launch browser with stealth mode
    logStep(0, "Launching browser with stealth mode", 'info');
    browser = await puppeteer.launch({
      headless: CONFIG.headless,
      slowMo: CONFIG.slowMo,
      executablePath: process.env.BROWSER_EXECUTABLE_PATH,
      userDataDir: process.env.BROWSER_PROFILE_USERDATA,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--profile-directory=Profile 1",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor"
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport(CONFIG.viewport);
    await page.setDefaultTimeout(CONFIG.timeout);
    await page.setDefaultNavigationTimeout(CONFIG.navigationTimeout);
    logStep(0, "Browser launched successfully", 'success');
    
    // Login to BrokerBay
    logStep("0.5", "Logging in to BrokerBay", 'info');
    const loginSuccess = await loginToBrokerBay(page);
    if (!loginSuccess) {
      throw new Error("Login failed - please check credentials");
    }
    logStep("0.5", "Logged in successfully", 'success');
    
    // Navigate to booking page
    logStep("0.6", "Navigating to booking page", 'info');
    await page.goto(BOOKING_URL, { 
      waitUntil: 'networkidle2',
      timeout: CONFIG.navigationTimeout 
    });
    await page.waitForTimeout(3000); // Wait for Angular app to initialize
    await takeScreenshot(page, '00_booking_page_loaded');
    logStep("0.6", "Booking page loaded", 'success');
    
    // Execute booking steps
    await fillProfileStep(page);
    await selectDateStep(page);
    const timeInfo = await selectTimeAndDurationStep(page);
    const buttonText = await submitBooking(page);
    const confirmation = await verifyConfirmation(page);
    
    // Extract booking date from page
    const bookingDate = await page.evaluate(() => {
      // Try to find selected date in various ways
      const selectedDate = document.querySelector('.selected, .active, [class*="selected"]');
      return selectedDate ? selectedDate.textContent.trim() : new Date().toLocaleDateString();
    });
    
    // Save to database
    logStep(6, "Saving booking to database", 'info');
    
    const bookingData = {
      listing_id: listingId,
      property_address: propertyAddress,
      booking_date: bookingDate || new Date().toISOString().split('T')[0],
      booking_time: timeInfo.time,
      duration: timeInfo.duration,
      user_name: USER_PROFILE.name,
      user_email: USER_PROFILE.email,
      organization: USER_PROFILE.organization,
      showing_type: USER_PROFILE.showingType,
      status: confirmation.isConfirmed ? 'Confirmed' : 'Pending',
      auto_confirmed: timeInfo.autoConfirm || confirmation.isConfirmed,
      booking_url: BOOKING_URL,
      screenshot_path: `${CONFIG.screenshotDir}/05_confirmation_*.png`,
      confirmation_message: confirmation.message
    };
    
    const bookingId = saveBooking(bookingData);
    
    if (bookingId) {
      logStep(6, `Booking saved successfully (ID: ${bookingId})`, 'success');
      bookingResult.success = true;
      bookingResult.bookingId = bookingId;
    } else {
      logStep(6, "Failed to save booking to database", 'error');
    }
    
    // Display summary
    log("\n" + "=".repeat(70), 'green');
    log("  ✅ BOOKING COMPLETE", 'green');
    log("=".repeat(70), 'green');
    log(`\n📍 Property: ${propertyAddress}`, 'white');
    log(`🆔 Listing ID: ${listingId}`, 'white');
    log(`📅 Date: ${bookingDate}`, 'white');
    log(`🕐 Time: ${timeInfo.time}`, 'white');
    log(`⏱️  Duration: ${timeInfo.duration}`, 'white');
    log(`✨ Status: ${timeInfo.autoConfirm ? '⚡ AUTO-CONFIRMED' : '⏳ PENDING CONFIRMATION'}`, timeInfo.autoConfirm ? 'green' : 'yellow');
    log(`👤 User: ${USER_PROFILE.name}`, 'white');
    log(`📧 Email: ${USER_PROFILE.email}`, 'white');
    log(`💾 Database ID: ${bookingId}`, 'white');
    log(`📸 Screenshots: ${CONFIG.screenshotDir}/`, 'dim');
    log(`\n${confirmation.message}`, confirmation.isConfirmed ? 'green' : 'yellow');
    log("\n" + "=".repeat(70) + "\n", 'green');
    
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
    log(`${error.stack}\n`, 'dim');
    bookingResult.error = error.message;
    
    if (browser) {
      try {
        const pages = await browser.pages();
        if (pages.length > 0) {
          await takeScreenshot(pages[0], 'error_state');
        }
      } catch (screenshotError) {
        log(`Could not take error screenshot: ${screenshotError.message}`, 'dim');
      }
    }
    
    process.exit(1);
  } finally {
    if (browser) {
      if (!CONFIG.headless) {
        log("Browser will remain open for 10 seconds for inspection...", 'dim');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      await browser.close();
      log("Browser closed\n", 'dim');
    }
  }
  
  return bookingResult;
}

// ==================== RUN THE SCRIPT ====================
autoBookShowing().catch(console.error);

