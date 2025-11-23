#!/usr/bin/env node

import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import Database from "better-sqlite3";
import readline from "readline";
import { loginToBrokerBay, performDashboardSearch } from "./src/utils.js";

puppeteer.use(StealthPlugin());
configDotenv();

// ==================== CLI INTERFACE ====================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

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

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// ==================== DATABASE HELPERS ====================
function setupDatabase() {
  const db = new Database("src/data/data.db");
  try { db.pragma('foreign_keys = OFF'); } catch { db.exec("PRAGMA foreign_keys = OFF"); }
  return db;
}

function getRecentBookings(limit = 10) {
  const db = setupDatabase();
  try {
    const stmt = db.prepare(`
      SELECT * FROM bookings 
      ORDER BY created_at DESC 
      LIMIT ?
    `);
    return stmt.all(limit);
  } catch (error) {
    return [];
  } finally {
    db.close();
  }
}

function searchProperties(searchQuery) {
  const db = setupDatabase();
  try {
    // This assumes you have a properties table from your scraper
    const stmt = db.prepare(`
      SELECT * FROM properties 
      WHERE address LIKE ? OR property_id LIKE ?
      LIMIT 20
    `);
    return stmt.all(`%${searchQuery}%`, `%${searchQuery}%`);
  } catch (error) {
    return [];
  } finally {
    db.close();
  }
}

// ==================== MENU SYSTEM ====================
function displayMainMenu() {
  console.clear();
  log("\n" + "=".repeat(70), 'cyan');
  log("  🏠 BROKER BAY INTERACTIVE BOOKING SYSTEM", 'cyan');
  log("=".repeat(70) + "\n", 'cyan');
  log("  1. Search and Book Property", 'white');
  log("  2. Quick Book by Listing ID", 'white');
  log("  3. View Recent Bookings", 'white');
  log("  4. View All Bookings", 'white');
  log("  5. Search Properties in Database", 'white');
  log("  6. Configure User Profile", 'white');
  log("  7. Test Browser Login", 'white');
  log("  8. Exit", 'white');
  log("\n" + "=".repeat(70) + "\n", 'cyan');
}

async function displayPropertyResults(properties) {
  if (properties.length === 0) {
    log("\n❌ No properties found matching your search.\n", 'red');
    return null;
  }
  
  log("\n" + "=".repeat(70), 'green');
  log(`  Found ${properties.length} properties:`, 'green');
  log("=".repeat(70) + "\n", 'green');
  
  properties.forEach((prop, index) => {
    log(`${index + 1}. ${prop.address || 'Unknown Address'}`, 'white');
    log(`   ID: ${prop.property_id || prop.listing_id}`, 'dim');
    log(`   Price: ${prop.price || 'N/A'} | Type: ${prop.type || 'N/A'}`, 'dim');
    log(`   Status: ${prop.status || 'N/A'}`, 'dim');
    log("", 'reset');
  });
  
  const selection = await question(colors.yellow + "\nSelect a property (number) or 0 to go back: " + colors.reset);
  const index = parseInt(selection) - 1;
  
  if (index >= 0 && index < properties.length) {
    return properties[index];
  }
  
  return null;
}

function displayBookings(bookings) {
  if (bookings.length === 0) {
    log("\n❌ No bookings found.\n", 'red');
    return;
  }
  
  log("\n" + "=".repeat(80), 'green');
  log(`  📋 BOOKINGS (${bookings.length} total)`, 'green');
  log("=".repeat(80) + "\n", 'green');
  
  bookings.forEach((booking, index) => {
    const statusIcon = booking.auto_confirmed ? '⚡' : booking.status === 'Confirmed' ? '✅' : '⏳';
    const statusColor = booking.auto_confirmed ? 'green' : booking.status === 'Confirmed' ? 'green' : 'yellow';
    
    log(`${index + 1}. ${booking.property_address || 'Unknown Property'}`, 'bright');
    log(`   📅 ${booking.booking_date} at ${booking.booking_time} (${booking.duration})`, 'white');
    log(`   ${statusIcon} Status: ${booking.status}`, statusColor);
    log(`   👤 ${booking.user_name} (${booking.user_email})`, 'dim');
    log(`   🆔 Listing: ${booking.listing_id}`, 'dim');
    log(`   📝 Created: ${booking.created_at}`, 'dim');
    log("", 'reset');
  });
}

// ==================== MENU ACTIONS ====================
async function searchAndBook() {
  log("\n🔍 Search and Book Property", 'cyan');
  log("=".repeat(70) + "\n", 'cyan');
  
  const searchQuery = await question(colors.white + "Enter property address or search term: " + colors.reset);
  
  if (!searchQuery || searchQuery.trim() === '') {
    log("❌ Search query cannot be empty", 'red');
    return;
  }
  
  log("\n🌐 Launching browser and searching BrokerBay...\n", 'cyan');
  
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: false,
      executablePath: process.env.BROWSER_EXECUTABLE_PATH,
      userDataDir: process.env.BROWSER_PROFILE_USERDATA,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--profile-directory=Profile 1",
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Login
    log("🔐 Logging in to BrokerBay...", 'cyan');
    const loginSuccess = await loginToBrokerBay(page);
    if (!loginSuccess) {
      log("❌ Login failed", 'red');
      return;
    }
    log("✅ Logged in successfully\n", 'green');
    
    // Search
    log(`🔎 Searching for: ${searchQuery}...`, 'cyan');
    const searchSuccess = await performDashboardSearch(page, searchQuery);
    if (!searchSuccess) {
      log("❌ Search failed", 'red');
      return;
    }
    
    // Wait for results to load
    await page.waitForTimeout(3000);
    
    // Extract search results from the page
    const properties = await page.evaluate(() => {
      const results = [];
      const rows = document.querySelectorAll('table tbody tr, [class*="listing-row"]');
      
      rows.forEach((row, index) => {
        try {
          // Extract property details from the table row
          const addressElement = row.querySelector('[class*="address"], td:nth-child(2)');
          const priceElement = row.querySelector('[class*="price"]');
          const listingIdElement = row.querySelector('[class*="listing-id"], [class*="propTx"]');
          
          if (addressElement) {
            const address = addressElement.textContent.trim();
            const listingId = listingIdElement ? listingIdElement.textContent.trim().replace('PropTx: ', '') : '';
            const price = priceElement ? priceElement.textContent.trim() : 'N/A';
            
            results.push({
              address: address,
              listing_id: listingId,
              price: price,
              index: index
            });
          }
        } catch (error) {
          // Skip this row
        }
      });
      
      return results;
    });
    
    if (properties.length === 0) {
      log("❌ No properties found. The page may be loading. Please try again.", 'red');
      log("💡 Browser will stay open - you can manually select a property", 'yellow');
      await question("\nPress Enter to continue...");
      return;
    }
    
    const selectedProperty = await displayPropertyResults(properties);
    
    if (selectedProperty && selectedProperty.listing_id) {
      log(`\n✅ Selected: ${selectedProperty.address}`, 'green');
      log(`🆔 Listing ID: ${selectedProperty.listing_id}`, 'dim');
      
      const confirm = await question(colors.yellow + "\nProceed with booking? (y/n): " + colors.reset);
      
      if (confirm.toLowerCase() === 'y') {
        log("\n🤖 Starting auto-booking process...", 'cyan');
        log("💡 Please close this browser and the booking will start in a new session\n", 'yellow');
        
        await browser.close();
        browser = null;
        
        // Execute the booking script
        const { spawn } = await import('child_process');
        const bookingProcess = spawn('node', [
          'auto-book-enhanced.js',
          selectedProperty.listing_id,
          selectedProperty.address
        ], {
          stdio: 'inherit'
        });
        
        await new Promise((resolve) => {
          bookingProcess.on('close', resolve);
        });
      }
    }
    
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
  } finally {
    if (browser) {
      await question(colors.dim + "\nPress Enter to close browser..." + colors.reset);
      await browser.close();
    }
  }
}

async function quickBookById() {
  log("\n⚡ Quick Book by Listing ID", 'cyan');
  log("=".repeat(70) + "\n", 'cyan');
  
  const listingId = await question(colors.white + "Enter listing ID: " + colors.reset);
  
  if (!listingId || !/^[a-f0-9]{24}$/i.test(listingId)) {
    log("❌ Invalid listing ID format (should be 24-character hex string)", 'red');
    return;
  }
  
  const address = await question(colors.white + "Enter property address (optional): " + colors.reset);
  
  log("\n🤖 Starting auto-booking process...\n", 'cyan');
  
  const { spawn } = await import('child_process');
  const args = address ? [listingId, address] : [listingId];
  
  const bookingProcess = spawn('node', ['auto-book-enhanced.js', ...args], {
    stdio: 'inherit'
  });
  
  await new Promise((resolve) => {
    bookingProcess.on('close', resolve);
  });
}

async function viewRecentBookings() {
  log("\n📋 Recent Bookings", 'cyan');
  log("=".repeat(70), 'cyan');
  
  const bookings = getRecentBookings(10);
  displayBookings(bookings);
  
  await question(colors.dim + "\nPress Enter to continue..." + colors.reset);
}

async function viewAllBookings() {
  log("\n📋 All Bookings", 'cyan');
  log("=".repeat(70), 'cyan');
  
  const bookings = getRecentBookings(1000);
  displayBookings(bookings);
  
  await question(colors.dim + "\nPress Enter to continue..." + colors.reset);
}

async function searchPropertiesMenu() {
  log("\n🔍 Search Properties in Database", 'cyan');
  log("=".repeat(70) + "\n", 'cyan');
  
  const searchQuery = await question(colors.white + "Enter search term: " + colors.reset);
  
  if (!searchQuery || searchQuery.trim() === '') {
    log("❌ Search query cannot be empty", 'red');
    return;
  }
  
  const properties = searchProperties(searchQuery);
  
  if (properties.length === 0) {
    log("\n❌ No properties found in local database.", 'red');
    log("💡 Try using option 1 to search BrokerBay directly.", 'yellow');
  } else {
    const selectedProperty = await displayPropertyResults(properties);
    
    if (selectedProperty) {
      const book = await question(colors.yellow + "\nBook this property? (y/n): " + colors.reset);
      if (book.toLowerCase() === 'y') {
        log("\n🤖 Starting auto-booking process...\n", 'cyan');
        
        const { spawn } = await import('child_process');
        const bookingProcess = spawn('node', [
          'auto-book-enhanced.js',
          selectedProperty.property_id || selectedProperty.listing_id,
          selectedProperty.address
        ], {
          stdio: 'inherit'
        });
        
        await new Promise((resolve) => {
          bookingProcess.on('close', resolve);
        });
      }
    }
  }
  
  await question(colors.dim + "\nPress Enter to continue..." + colors.reset);
}

async function configureUserProfile() {
  log("\n⚙️  Configure User Profile", 'cyan');
  log("=".repeat(70) + "\n", 'cyan');
  
  log("Current settings from .env:", 'dim');
  log(`  Name: ${process.env.USER_NAME || 'Not set'}`, 'white');
  log(`  Email: ${process.env.USER_EMAIL || 'Not set'}`, 'white');
  log(`  Organization: ${process.env.USER_ORGANIZATION || 'Not set'}`, 'white');
  log(`  Showing Type: ${process.env.SHOWING_TYPE || 'Buyer/Broker'}`, 'white');
  log(`  Preferred Duration: ${process.env.PREFERRED_DURATION || '45'} minutes`, 'white');
  log(`  Auto-Confirm Only: ${process.env.AUTO_CONFIRM_ONLY || 'false'}`, 'white');
  
  log("\n💡 To change these settings, edit your .env file:", 'yellow');
  log("   USER_NAME=\"Your Name\"", 'dim');
  log("   USER_EMAIL=\"your.email@example.com\"", 'dim');
  log("   USER_ORGANIZATION=\"Your Organization\"", 'dim');
  log("   SHOWING_TYPE=\"Buyer/Broker\"", 'dim');
  log("   PREFERRED_DURATION=\"45\"  # 15, 30, 45, or 60", 'dim');
  log("   AUTO_CONFIRM_ONLY=\"false\"  # true or false", 'dim');
  
  await question(colors.dim + "\nPress Enter to continue..." + colors.reset);
}

async function testBrowserLogin() {
  log("\n🧪 Test Browser Login", 'cyan');
  log("=".repeat(70) + "\n", 'cyan');
  
  log("🌐 Launching browser...", 'cyan');
  
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: false,
      executablePath: process.env.BROWSER_EXECUTABLE_PATH,
      userDataDir: process.env.BROWSER_PROFILE_USERDATA,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--profile-directory=Profile 1",
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    log("🔐 Testing login...", 'cyan');
    const loginSuccess = await loginToBrokerBay(page);
    
    if (loginSuccess) {
      log("✅ Login successful!", 'green');
      log(`🌐 Current URL: ${page.url()}`, 'dim');
      
      await page.screenshot({ path: 'test-login-success.png', fullPage: true });
      log("📸 Screenshot saved: test-login-success.png", 'dim');
    } else {
      log("❌ Login failed!", 'red');
    }
    
    await question(colors.dim + "\nPress Enter to close browser..." + colors.reset);
    
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, 'red');
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ==================== MAIN LOOP ====================
async function main() {
  let running = true;
  
  while (running) {
    displayMainMenu();
    
    const choice = await question(colors.bright + "Select an option (1-8): " + colors.reset);
    
    switch (choice) {
      case '1':
        await searchAndBook();
        break;
      case '2':
        await quickBookById();
        break;
      case '3':
        await viewRecentBookings();
        break;
      case '4':
        await viewAllBookings();
        break;
      case '5':
        await searchPropertiesMenu();
        break;
      case '6':
        await configureUserProfile();
        break;
      case '7':
        await testBrowserLogin();
        break;
      case '8':
        log("\n👋 Goodbye!\n", 'cyan');
        running = false;
        break;
      default:
        log("\n❌ Invalid option. Please try again.\n", 'red');
        await question(colors.dim + "Press Enter to continue..." + colors.reset);
    }
  }
  
  rl.close();
}

// ==================== RUN ====================
main().catch(console.error);

