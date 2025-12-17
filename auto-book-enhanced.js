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
  timeout: 120000, // 2 minutes for slow pages
  screenshotDir: "src/data/screenshots",
  viewport: { width: 1920, height: 1080 },
  navigationTimeout: 180000, // 3 minutes for navigation
  waitAfterAction: 2000, // 2 seconds after actions
  pageLoadWait: 5000 // 5 seconds for page elements to load
};

// Helper function to replace deprecated waitForTimeout
async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
let propertyAddress = args[0];
let preferredTimeArg = args[1] || process.env.PREFERRED_TIME || "";
let preferredDateArg = args[2] || process.env.PREFERRED_DATE || "";

if (!propertyAddress) {
  console.error("\n❌ Error: Please provide a property address to search");
  console.log("\nUsage: node auto-book-enhanced.js <property_address> [preferred_time] [preferred_date]");
  console.log("Example: node auto-book-enhanced.js '266 Brant Avenue' '10:00 AM' '15'\n");
  console.log("The script will:");
  console.log("  1. Search for the property on BrokerBay");
  console.log("  2. Select it from search results");
  console.log("  3. Click 'Book Showing' button");
  console.log("  4. Complete the booking form");
  console.log("  5. Click 'AUTO-CONFIRM' to finalize\n");
  process.exit(1);
}

const BROKERBAY_DASHBOARD = "https://edge.brokerbay.com/#/listing/list/brokerage";

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
      auto_confirmed INTEGER DEFAULT 0,
      booking_url TEXT,
      screenshot_path TEXT,
      confirmation_message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const columns = db.prepare("PRAGMA table_info(bookings)").all();
  const columnNames = columns.map((c) => c.name);
  const expectedColumns = [
    { name: "listing_id", type: "TEXT" },
    { name: "property_address", type: "TEXT" },
    { name: "booking_date", type: "TEXT" },
    { name: "booking_time", type: "TEXT" },
    { name: "duration", type: "TEXT" },
    { name: "user_name", type: "TEXT" },
    { name: "user_email", type: "TEXT" },
    { name: "organization", type: "TEXT" },
    { name: "showing_type", type: "TEXT" },
    { name: "status", type: "TEXT" },
    { name: "auto_confirmed", type: "INTEGER", defaultExpr: "0" },
    { name: "booking_url", type: "TEXT" },
    { name: "screenshot_path", type: "TEXT" },
    { name: "confirmation_message", type: "TEXT" },
    { name: "created_at", type: "TEXT", defaultExpr: "CURRENT_TIMESTAMP" }
  ];
  for (const col of expectedColumns) {
    if (!columnNames.includes(col.name)) {
      const defaultClause = col.defaultExpr ? ` DEFAULT ${col.defaultExpr}` : "";
      db.exec(`ALTER TABLE bookings ADD COLUMN ${col.name} ${col.type}${defaultClause};`);
    }
  }
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

async function clickElementSafely(page, element, description = "element") {
  try {
    await element.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }));
    await wait(400);
    await element.click({ delay: 50 });
    log(`  ✓ Clicked ${description}`, 'dim');
    return true;
  } catch (error) {
    log(`  ⚠️ ${description} not directly clickable (${error.message}). Trying fallback...`, 'yellow');
    try {
      const box = await element.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await wait(150);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { delay: 50 });
        log(`  ✓ Clicked ${description} via mouse coordinates`, 'dim');
        return true;
      }
    } catch (mouseError) {
      log(`  ⚠️ Mouse click fallback failed: ${mouseError.message}`, 'yellow');
    }
    try {
      await page.evaluate(el => el.click(), element);
      log(`  ✓ Clicked ${description} via DOM`, 'dim');
      return true;
    } catch (domError) {
      log(`  ❌ All click attempts failed for ${description}: ${domError.message}`, 'red');
      return false;
    }
  }
}

// ==================== STEP 0.7: SEARCH FOR PROPERTY ====================
async function searchForProperty(page, searchQuery) {
  logStep("0.7", "Searching for property on BrokerBay", 'info');
  
  log(`  Searching for: ${searchQuery}`, 'dim');
  
  // Wait for page to fully load
  await wait(CONFIG.pageLoadWait);
  
  // Find the search bar - try multiple selectors
  const searchSelectors = [
    'input[placeholder*="Search listings"]',
    'input[placeholder*="Search"]',
    'input[type="search"]',
    'input[ng-model*="search"]',
    '.search-input input',
    '#search-input'
  ];
  
  let searchFound = false;
  for (const selector of searchSelectors) {
    try {
      const searchBox = await page.$(selector);
      if (searchBox) {
        await searchBox.click();
        await searchBox.type(searchQuery, { delay: 100 });
        log(`  ✓ Entered search query`, 'dim');
        searchFound = true;
        
        // Press Enter to search
        await page.keyboard.press('Enter');
        log(`  ✓ Pressed Enter to search`, 'dim');
        break;
      }
    } catch (error) {
      continue;
    }
  }
  
  if (!searchFound) {
    throw new Error("Could not find search bar");
  }
  
  // Wait for search results to actually load (not just a fixed timeout)
  log(`  ⏳ Waiting for search results to load...`, 'dim');
  
  try {
    await page.waitForFunction(
      () => {
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        const validRows = rows.filter(row => {
          const text = (row.textContent || '').trim();
          return text.length > 50 && !text.toLowerCase().includes('loading');
        });
        return validRows.length > 0;
      },
      { timeout: 20000 }
    );
    log(`  ✓ Search results loaded`, 'dim');
  } catch (e) {
    log(`  ⚠️ Timeout waiting for results, proceeding anyway`, 'yellow');
  }
  
  await wait(2000);
  await takeScreenshot(page, '00_search_results');
  
  logStep("0.7", "Search completed", 'success');
}

// ==================== STEP 0.8: SELECT PROPERTY FROM RESULTS ====================
async function selectPropertyFromResults(page, searchQuery) {
  logStep("0.8", "Selecting property from search results", "info");

  await wait(3000);

  const listingUrlPattern = /\/listing\/[^/]+\/view/i;
  const searchRoot = searchQuery.toLowerCase().split(",")[0].trim();

  const rowSelectors = [
    "table tbody tr",
    ".listing-row",
    ".property-row",
    "[ng-repeat*=\"listing\"]"
  ];

  let targetRow = null;

  // Find the best matching row in the search results
  for (const selector of rowSelectors) {
    const rows = await page.$$(selector);
    if (!rows.length) continue;

    log(`  Found ${rows.length} rows with selector "${selector}"`, "dim");

    // Filter out empty/invalid rows
    const validRows = [];
    for (const row of rows) {
      try {
        const text = await page.evaluate(el => el.textContent || "", row);
        // Skip rows with very little content (likely headers or empty states)
        if (!text || text.trim().length < 30) continue;
        validRows.push({ row, text });
      } catch {
        continue;
      }
    }

    if (validRows.length === 0) {
      log(`  ⚠️ Found ${rows.length} rows but none contain valid listing data`, "yellow");
      continue;
    }

    log(`  ✓ Found ${validRows.length} valid listing rows`, "dim");

    // Try to find exact match
    for (const { row, text } of validRows) {
      const lower = text.toLowerCase();
      if (lower.includes(searchRoot)) {
        targetRow = row;
        log("  ✓ Found matching row for property search", "green");
        break;
      }
    }

    // If we didn't find an exact match, fall back to the first valid row
    if (!targetRow && validRows.length) {
      targetRow = validRows[0].row;
      log("  ⚠️ No exact match found. Falling back to first valid search result row.", "yellow");
    }

    if (targetRow) break;
  }

  if (!targetRow) {
    await takeScreenshot(page, "00_no_search_rows_found");
    throw new Error("Could not find property in search results (no valid rows found). This usually means the search returned no results or the page did not load properly. Check screenshot: 00_no_search_rows_found*.png");
  }

  const beforeUrl = page.url();
  log(`  Current URL before clicking result: ${beforeUrl}`, "dim");

  // Click the row and wait for the hash-based URL to change to the listing view pattern.
  log("  Clicking result row and waiting for listing URL ...", "dim");

  await clickElementSafely(page, targetRow, "search result row");

  // Try to detect navigation either by URL change OR by listing UI appearing.
  const detectListingViewOnce = async () => {
    // 1) Prefer URL change if BrokerBay still updates the hash.
    if (listingUrlPattern.test(page.url())) {
      return true;
    }
    try {
      await page.waitForFunction(
        () => /\/listing\/[^/]+\/view/i.test(window.location.href),
        { timeout: 1500 }
      );
      return true;
    } catch {
      // fall through
    }

    // 2) Fallback: some layouts keep the URL but open a listing panel.
    try {
      return await page.evaluate(() => {
        const labels = [
          "book showing",
          "book a showing",
          "book showing request",
          "book showing appointment",
          "book tour",
          "request showing",
          "request a showing"
        ];
        const buttons = Array.from(
          document.querySelectorAll("button, a[role='button'], [role='button']")
        );
        const hasBookButton = buttons.some((el) => {
          const text = (el.innerText || el.textContent || "").toLowerCase();
          return labels.some((l) => text.includes(l));
        });
        if (hasBookButton) return true;

        const detailSelectors = [
          ".listing-view",
          ".bb-listing-view",
          "[data-testid*='listing-view']",
          "[class*='listing-details']"
        ];
        return detailSelectors.some((sel) => document.querySelector(sel));
      });
    } catch {
      return false;
    }
  };

  const detectListingView = async (timeoutMs = CONFIG.navigationTimeout) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await detectListingViewOnce()) return true;
      await wait(750);
    }
    return false;
  };

  let listingViewDetected = await detectListingView(3000);

  const afterUrl = page.url();
  log(`  URL after clicking result: ${afterUrl}`, "dim");

  // Deep fallback: force navigation via link or data-id inside the row.
  if (!listingViewDetected && !listingUrlPattern.test(afterUrl)) {
    log("  ⚠️ Forcing navigation via row link / data-id fallback", "yellow");
    try {
      const forcedNav = await page.evaluate((row) => {
        if (!row) return null;

        const clickEl = (el) => {
          if (!el) return false;
          el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
          el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          return true;
        };

        const link =
          row.querySelector("a[href*='/listing/']") ||
          row.querySelector("a[href*='listing']") ||
          row.querySelector("a[data-href*='listing']");
        if (link && link.getAttribute("href")) {
          const href = link.getAttribute("href");
          clickEl(link);
          return { type: "link", href };
        }

        const id =
          row.getAttribute("data-id") ||
          row.getAttribute("data-listing-id") ||
          row.getAttribute("listing-id") ||
          (row.dataset && (row.dataset.id || row.dataset.listingId));
        if (id) {
          const href = `#/listing/${id}/view`;
          window.location.href = href;
          return { type: "id", href };
        }

        const button =
          row.querySelector("button, [role='button'], a") ||
          row.querySelector("td, div, span");
        if (button && clickEl(button)) {
          return { type: "button" };
        }

        // As a last resort, try dblclick + Enter on the row
        row.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
        row.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
        row.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
        return { type: "dblclick" };

        return null;
      }, targetRow);

      if (forcedNav) {
        log(`  ⚠️ Fallback navigation attempted (${forcedNav.type}${forcedNav.href ? `: ${forcedNav.href}` : ""})`, "yellow");
      } else {
        log("  ⚠️ No link/data-id/button found in row for forced navigation", "yellow");
      }
    } catch (e) {
      log(`  ⚠️ Forced navigation attempt failed: ${e.message}`, "yellow");
    }

    // Re-check after forced navigation attempt (full timeout again).
    listingViewDetected = await detectListingView(CONFIG.navigationTimeout);
  }

  if (!listingViewDetected && !listingUrlPattern.test(page.url())) {
    await takeScreenshot(page, "00_listing_url_not_reached");
    throw new Error(`Listing page not reached; current URL: ${page.url()}`);
  }

  await wait(CONFIG.pageLoadWait);
  await takeScreenshot(page, "00_property_page");

  logStep("0.8", "Property page loaded", "success");
  return page;
}

// ==================== STEP 0.9: CLICK "BOOK SHOWING" BUTTON ====================
async function clickBookShowingButton(page) {
  logStep("0.9", "Clicking 'Book Showing' button", 'info');
  
  await wait(3000);
  
  const probableContainers = [
    '.listing-actions',
    '.actions-container',
    '.bb-sticky-actions',
    '.action-buttons',
    '.sticky-actions',
    '.listing-header',
    'header'
  ];
  const buttonSelectors = [
    '.listing-actions button',
    '.actions-container button',
    '.bb-sticky-actions button',
    '.action-buttons button',
    '.sticky-actions button',
    '.bb-btn',
    '.btn-primary',
    'button',
    'a[role="button"]',
    '[role="button"]',
    'a.bb-btn'
  ];
  const labelVariants = [
    "book showing",
    "book a showing",
    "book showing request",
    "book showing appointment",
    "book tour",
    "request showing",
    "request a showing"
  ];
  
  let buttonClicked = false;
  let buttonHandle = null;
  
  for (const label of labelVariants) {
    buttonHandle = await findElementByText(page, buttonSelectors, label);
    if (buttonHandle) {
      log(`  ✓ Found button variant using text "${label}"`, 'dim');
      const clicked = await clickElementSafely(page, buttonHandle, `'${label}' button`);
      await buttonHandle.dispose();
      buttonClicked = clicked;
      break;
    }
  }
  
  if (!buttonClicked) {
    const handle = await page.evaluateHandle(() => {
      const labels = [
        "book showing",
        "book a showing",
        "book showing request",
        "book showing appointment",
        "book tour",
        "request showing",
        "request a showing"
      ];
      const candidates = Array.from(
        document.querySelectorAll("button, a[role='button'], [role='button']")
      );
      return (
        candidates.find((el) => {
          const text = (el.innerText || el.textContent || "").toLowerCase();
          return labels.some((l) => text.includes(l));
        }) || null
      );
    });
    const el = handle.asElement();
    if (el) {
      log(`  ✓ Found 'Book Showing' button via text scan`, "dim");
      buttonClicked = await clickElementSafely(page, el, "'Book Showing' button");
    }
    await handle.dispose();
  }
  
  if (!buttonClicked) {
    // Try clicking the first visible button within known containers
    for (const selector of probableContainers) {
      const container = await page.$(selector);
      if (!container) continue;
      const button = await container.$('button, a[role="button"], [role="button"]');
      if (button) {
        log(`  ⚠️ Using fallback button inside ${selector}`, 'yellow');
        buttonClicked = await clickElementSafely(page, button, `fallback button in ${selector}`);
        break;
      }
    }
  }
  
  if (!buttonClicked) {
    throw new Error("Could not find 'Book Showing' button");
  }
  
  log(`  ✓ Clicked 'Book Showing' button`, 'dim');
  
  // Wait for booking page to load
  await wait(CONFIG.pageLoadWait);
  await takeScreenshot(page, '00_booking_page_loaded');
  
  logStep("0.9", "Booking page opened", 'success');
}

// ==================== UTILITY: EXTRACT LISTING ID ====================
function extractListingIdFromUrl(page) {
  const currentUrl = page.url();
  const match = currentUrl.match(/listing\/([a-f0-9]{24})/i);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

async function safeClick(page, selector, description = "element") {
  try {
    await page.waitForSelector(selector, { timeout: 10000, visible: true });
    await page.click(selector);
    log(`  ✓ Clicked ${description}`, 'dim');
    await wait(CONFIG.waitAfterAction);
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

async function waitForAutoConfirmButton(page, timeout = 15000) {
  try {
    await page.waitForFunction(() => {
      const candidates = Array.from(document.querySelectorAll('button, a[role="button"], [role="button"]'));
      const btn = candidates.find((el) => {
        const label = (el.innerText || el.textContent || '').trim().toLowerCase();
        return label.includes('auto-confirm');
      });
      if (!btn) return false;
      const disabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true';
      if (disabled) return false;
      const style = window.getComputedStyle(btn);
      return style.pointerEvents !== 'none';
    }, { timeout });
    log(`  ✓ AUTO-CONFIRM button is enabled`, 'dim');
  } catch (error) {
    log(`  ⚠️ AUTO-CONFIRM button did not become clickable within ${timeout}ms: ${error.message}`, 'yellow');
  }
}

async function findElementByText(page, selectors, text) {
  const handle = await page.evaluateHandle(({ selectors, text }) => {
    const needle = text.toLowerCase();

    const scan = (elements) => {
      for (const el of elements) {
        const label = (el.innerText || el.textContent || '').trim().toLowerCase();
        if (!label) continue;
        if (label.includes(needle)) {
          return el;
        }
      }
      return null;
    };

    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector));
      const match = scan(elements);
      if (match) return match;
    }

    return scan(Array.from(document.querySelectorAll('button, a, [role="button"]')));
  }, { selectors, text });

  const element = handle.asElement();
  if (!element) {
    await handle.dispose();
    return null;
  }
  return element;
}

// ==================== STEP 1: FILL PROFILE ====================
async function fillProfileStep(page) {
  logStep(1, "Reviewing profile information (Step 1 - Your Profile)", 'info');
  
  await wait(2000); // Wait for form to render
  
  const profileState = await page.evaluate((name, email, org) => {
    const bodyText = (document.body?.innerText || '').toLowerCase();
    const hasName = bodyText.includes(name.toLowerCase());
    const hasEmail = bodyText.includes(email.toLowerCase());
    const hasOrg = org ? bodyText.includes(org.toLowerCase()) : true;
    const inputSelectors = [
      'input[name="name"]',
      'input[ng-model*="name"]',
      'input[placeholder*="Name"]',
      'input[type="text"]',
      'input[type="email"]'
    ];
    const hasEditableInputs = inputSelectors.some(sel => document.querySelector(sel));
    return {
      hasName,
      hasEmail,
      hasOrg,
      hasEditableInputs
    };
  }, USER_PROFILE.name, USER_PROFILE.email, USER_PROFILE.organization);
  
  if (profileState.hasName && profileState.hasEmail && profileState.hasOrg) {
    log(`  ℹ️ Profile info detected on page. Leaving fields as-is.`, 'dim');
  } else {
    log(
      `  ℹ️ Proceeding without editing profile fields (detected: name=${profileState.hasName}, email=${profileState.hasEmail}, org=${profileState.hasOrg}).`,
      'dim'
    );
  }
  
  await takeScreenshot(page, '01_profile_verified');
  logStep(1, "Profile fields verified (no manual edits applied)", 'success');
  return true;
}

// ==================== STEP 2: SELECT DATE ====================
async function selectDateStep(page, preferredDate = null) {
  logStep(2, `Selecting date${preferredDate ? ` (Preferred: ${preferredDate})` : ""} (Step 2 - Select Date)`, 'info');
  
  await wait(2000); // Wait for calendar to load

  if (preferredDate) {
    const dayToSelect = preferredDate.includes('-')
      ? new Date(preferredDate).getDate().toString()
      : preferredDate;

    log(`  Trying to select preferred date: ${dayToSelect}`, 'dim');

    // Try to find and click the specific date (tolerant of extra markup/text)
    const dateClicked = await page.evaluate((dayString) => {
      const targetDay = parseInt(dayString, 10);
      if (Number.isNaN(targetDay)) return false;

      const selectors = [
        'td.day:not(.disabled):not(.old):not(.new)',
        'button[class*="date"]:not([disabled])',
        '.calendar-day:not(.disabled)',
        'td.available'
      ];

      const normalizeCellDay = (el) => {
        // Prefer aria-label if present (e.g. "Friday, December 12, 2025")
        const aria = el.getAttribute('aria-label') || '';
        const fromAria = aria.match(/\b(\d{1,2})\b/);
        if (fromAria) return parseInt(fromAria[1], 10);

        const text = (el.textContent || '').trim();
        const match = text.match(/\b(\d{1,2})\b/);
        return match ? parseInt(match[1], 10) : NaN;
      };

      for (const selector of selectors) {
        const elements = Array.from(document.querySelectorAll(selector));
        for (const el of elements) {
          const cellDay = normalizeCellDay(el);
          if (!Number.isNaN(cellDay) && cellDay === targetDay) {
            el.click();
            return true;
          }
        }
      }
      return false;
    }, dayToSelect);

    if (dateClicked) {
      log(`  ✓ Selected preferred date: ${dayToSelect}`, 'green');
      await wait(2000); // Wait for slots to reload
      await takeScreenshot(page, '02_date_selected_preferred');
      return true;
    } else {
      log(`  ⚠️ Preferred date ${dayToSelect} not found or unavailable. Falling back to default logic.`, 'yellow');
    }
  }
  
  // If time slots are already visible, keep whatever date BrokerBay has selected by default.
  const hasVisibleTimeSlots = await page.evaluate(() => {
    const slotSelectors = [
      'button[class*="time"]:not([disabled])',
      '.time-slot:not(.disabled)',
      '[class*="slot"]:not([disabled])',
      '.bb-appointment-time button:not([disabled])',
      '.bb-booking-time button:not([disabled])'
    ];
    
    for (const selector of slotSelectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        continue;
      }
      return true;
    }
    
    return false;
  });
  
  if (hasVisibleTimeSlots) {
    const existingSelection = await page.evaluate(() => {
      const selectors = [
        '.calendar-day.selected',
        '.calendar-day.active',
        'td.selected',
        'td.active',
        '.day.selected',
        '.day.active',
        '.bb-calendar__day--selected',
        '.bb-calendar__day--active'
      ];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && el.textContent) {
          return el.textContent.trim();
        }
      }
      return null;
    });
    
    if (existingSelection) {
      log(`  ✓ Keeping current booking date: ${existingSelection}`, 'dim');
    } else {
      log(`  ✓ Keeping current booking date as shown on page`, 'dim');
    }
    
    await takeScreenshot(page, '02_date_verified');
    return true;
  }
  
  const existingSelection = await page.evaluate(() => {
    const selectors = [
      '.calendar-day.selected',
      '.calendar-day.active',
      'td.selected',
      'td.active',
      '.day.selected',
      '.day.active'
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        return el.textContent?.trim() || null;
      }
    }
    return null;
  });
  
  if (existingSelection) {
    log(`  ✓ Keeping current booking date: ${existingSelection}`, 'dim');
    await takeScreenshot(page, '02_date_verified');
    return true;
  }
  
  // Look for the current date indicator
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
        await wait(2000); // Wait for time slots to load
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
            await wait(2000);
            
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
  
  await wait(2000); // Wait for time slots to render
  
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
          const labelElement = el.closest("label") || el.parentElement;
          return labelElement ? labelElement.textContent : "";
        }, radio);
        
        if (value == USER_PROFILE.preferredDuration || label.includes(USER_PROFILE.preferredDuration.toString())) {
          await radio.click();
          await wait(1500);
          log(`  ✓ Selected duration: ${USER_PROFILE.preferredDuration} minutes`, "dim");
          durationSet = true;
          break;
        }
      } catch (error) {
        continue;
      }
    }
    
    if (durationSet) break;
  }
  
  await wait(1500);
  
  const timeSlotSelectors = [
    'button[class*="time"]:not([disabled])',
    ".time-slot:not(.disabled)",
    '[class*="slot"]:not([disabled])',
    'div[class*="time"]',
    'button[ng-click*="time"]'
  ];
  
  let selectedSlot = null;
  let autoConfirm = false;
  
  function parseTimeToMinutes(label) {
    if (!label) return null;
    const lower = label.toLowerCase();
    const match = lower.match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    let hour = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const isPm = lower.includes("pm");
    const isAm = lower.includes("am");
    if (isPm && hour < 12) hour += 12;
    if (isAm && hour === 12) hour = 0;
    if (!isPm && !isAm && hour >= 1 && hour <= 6) hour += 12;
    return hour * 60 + minutes;
  }
  
  function pickBestSlot(candidateSlots, preferredTime) {
    if (!candidateSlots.length) return null;
    if (!preferredTime) return null;
    const prefMinutes = parseTimeToMinutes(preferredTime);
    if (prefMinutes == null) return null;
    let best = null;
    let bestDelta = Infinity;
    for (const slot of candidateSlots) {
      const m = parseTimeToMinutes(slot.text);
      if (m == null) continue;
      if (m < prefMinutes) continue;
      const delta = m - prefMinutes;
      if (delta < bestDelta) {
        best = slot;
        bestDelta = delta;
      }
    }
    return best;
  }
  
  const normalizedPreferredTime = (preferredTimeArg || "").trim();
  
  for (const selector of timeSlotSelectors) {
    const slots = await page.$$(selector);
    
    if (slots.length > 0) {
      log(`  Found ${slots.length} available time slots`, "dim");
      const slotData = [];
      
      for (let i = 0; i < slots.length; i++) {
        try {
          const data = await page.evaluate((el) => {
            const text = el.textContent || el.innerText || "";
            const classes = el.className || "";
            const style = window.getComputedStyle(el);
            const bgColor = (style.backgroundColor || "").toLowerCase();
            const isDisabled = el.disabled || el.getAttribute("aria-disabled") === "true";
            const isRed = (() => {
              const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
              if (!match) return false;
              const [r, g, b] = match.slice(1).map(Number);
              return r > 190 && g < 120 && b < 120;
            })();
            const isGreen = (() => {
              const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
              if (!match) return false;
              const [r, g, b] = match.slice(1).map(Number);
              return g > 150 && r < 150 && b < 150;
            })();
            const lowerText = text.toLowerCase();
            const isAutoConfirm =
              classes.toLowerCase().includes("green") ||
              classes.toLowerCase().includes("auto") ||
              lowerText.includes("auto") ||
              isGreen;
            const isUnavailable =
              isDisabled ||
              classes.toLowerCase().includes("booked") ||
              classes.toLowerCase().includes("unavailable") ||
              classes.toLowerCase().includes("blocked") ||
              lowerText.includes("booked") ||
              lowerText.includes("unavailable") ||
              isRed;
            const isSelected =
              classes.toLowerCase().includes("selected") ||
              classes.toLowerCase().includes("active") ||
              isGreen;
            return {
              text: text.trim(),
              classes,
              bgColor,
              isAutoConfirm,
              isUnavailable,
              isSelected
            };
          }, slots[i]);
          
          slotData.push({ index: i, element: slots[i], ...data });
        } catch (error) {
          continue;
        }
      }
      
      slotData.forEach(slot => {
        const lowerText = (slot.text || "").toLowerCase();
        const hasTen = lowerText.includes("10:00");
        const isAm = lowerText.includes("am");
        const isPm = lowerText.includes("pm");
        slot.isPreferredTime = hasTen && isPm && !isAm;
      });
      
      let candidateSlots = slotData.filter(slot => !slot.isUnavailable && !slot.isSelected);
      
      if (!candidateSlots.length) {
        log(`  ⚠️ Slots found, but all were unavailable or already taken.`, "yellow");
        continue;
      }
      
      log(`\n  Available time slots:`, "cyan");
      candidateSlots.forEach((slot, idx) => {
        const markers = [];
        if (slot.isAutoConfirm) markers.push("AUTO-CONFIRM");
        if (slot.isPreferredTime) markers.push("PREFERRED (10:00 AM)");
        log(`    ${idx + 1}. ${slot.text}${markers.length ? ` [${markers.join(", ")}]` : ""}`, slot.isAutoConfirm ? "green" : "white");
      });
      
      let preferredSlot = null;
      if (normalizedPreferredTime) {
        const baseCandidates = USER_PROFILE.autoConfirmOnly ? candidateSlots.filter(s => s.isAutoConfirm) : candidateSlots;
        preferredSlot = pickBestSlot(baseCandidates, normalizedPreferredTime);
        if (!preferredSlot && !USER_PROFILE.autoConfirmOnly) {
          preferredSlot = pickBestSlot(candidateSlots, normalizedPreferredTime);
        }
        if (preferredSlot) {
          log(`\n  Selected slot closest to requested time "${normalizedPreferredTime}": ${preferredSlot.text}`, "cyan");
        }
      }
      
      if (!preferredSlot) {
        const preferredSlots = candidateSlots.filter(s => s.isPreferredTime);
        if (preferredSlots.length > 0) {
          selectedSlot = preferredSlots[0];
          autoConfirm = selectedSlot.isAutoConfirm;
          log(`\n  Selected preferred 10:00 AM slot: ${selectedSlot.text}`, "cyan");
        } else {
          if (USER_PROFILE.autoConfirmOnly) {
            const autoConfirmSlots = candidateSlots.filter(s => s.isAutoConfirm);
            if (autoConfirmSlots.length > 0) {
              selectedSlot = autoConfirmSlots[0];
              autoConfirm = true;
              log(`\n  Selected AUTO-CONFIRM slot: ${selectedSlot.text}`, "green");
            } else {
              throw new Error("No auto-confirm slots available (AUTO_CONFIRM_ONLY is enabled)");
            }
          } else {
            const autoConfirmSlots = candidateSlots.filter(s => s.isAutoConfirm);
            if (autoConfirmSlots.length > 0) {
              selectedSlot = autoConfirmSlots[0];
              autoConfirm = true;
              log(`\n  Selected AUTO-CONFIRM slot: ${selectedSlot.text}`, "green");
            } else {
              selectedSlot = candidateSlots[0];
              log(`\n  Selected regular slot: ${selectedSlot.text}`, "cyan");
            }
          }
        }
      } else {
        selectedSlot = preferredSlot;
        autoConfirm = preferredSlot.isAutoConfirm;
      }
      
      if (selectedSlot) {
        await clickElementSafely(page, selectedSlot.element, `time slot ${selectedSlot.text}`);
        await wait(CONFIG.waitAfterAction);
        await waitForAutoConfirmButton(page, 20000);
        log(`  ✓ Time slot clicked`, "dim");
        break;
      }
    }
  }
  
  if (!selectedSlot) {
    throw new Error("No available time slots found");
  }
  
  await takeScreenshot(page, "03_time_selected");
  logStep(3, "Time and duration selected successfully", "success");
  
  return {
    time: selectedSlot.text,
    duration: `${USER_PROFILE.preferredDuration} minutes`,
    autoConfirm: autoConfirm
  };
}

// ==================== STEP 4: CLICK AUTO-CONFIRM BUTTON ====================
async function submitBooking(page) {
  logStep(4, "Clicking AUTO-CONFIRM button", 'info');
  
  await wait(2000);
  
  log(`  Looking for AUTO-CONFIRM button in top right...`, 'dim');
  
  // The AUTO-CONFIRM button is in the top right corner of the booking page
  // Try multiple approaches to find it
  
  let submitted = false;
  let buttonText = '';
  let isAutoConfirm = false;
  
  // Strategy 1: Direct DOM search for AUTO-CONFIRM text (no XPath)
  const autoConfirmHandle = await page.evaluateHandle(() => {
    const candidates = Array.from(document.querySelectorAll('button, a[role="button"], [role="button"]'));
    const regex = /auto[\s-]?confirm/i;
    return candidates.find(el => {
      const label = (el.innerText || el.textContent || '').trim();
      return regex.test(label);
    }) || null;
  });
  
  const autoConfirmElement = autoConfirmHandle.asElement();
  
  if (autoConfirmElement) {
    buttonText = (await page.evaluate(el => el.textContent || '', autoConfirmElement)).trim();
    log(`  ✓ Found AUTO-CONFIRM button: "${buttonText}"`, 'green');
    
    // Scroll button into view
    await autoConfirmElement.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    await wait(500);
    
    await autoConfirmElement.click();
    submitted = true;
    isAutoConfirm = true;
    log(`  ✓ Clicked AUTO-CONFIRM button`, 'green');
  }
  
  await autoConfirmHandle.dispose();
  
  // Strategy 1b: Look for top-right Book/Request Showing button on booking page
  if (!submitted) {
    const bookingHandle = await page.evaluateHandle(() => {
      const candidates = Array.from(document.querySelectorAll('button, a[role="button"], [role="button"]'));
      const regex = /(book[\s-]*showing|request[\s-]*showing)/i;
      return candidates.find(el => {
        const label = (el.innerText || el.textContent || '').trim();
        return regex.test(label);
      }) || null;
    });
    
    const bookingElement = bookingHandle.asElement();
    
    if (bookingElement) {
      buttonText = (await page.evaluate(el => el.textContent || '', bookingElement)).trim();
      log(`  ✓ Found booking action button: "${buttonText}"`, 'green');
      await bookingElement.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      await wait(500);
      await bookingElement.click();
      submitted = true;
      isAutoConfirm = buttonText.toLowerCase().includes('auto');
      log(`  ✓ Clicked booking action button`, 'green');
    }
    
    await bookingHandle.dispose();
  }
  
  // Strategy 2: Look for button with green color class or auto-confirm class
  if (!submitted) {
    const greenButtonSelectors = [
      'button.btn-success',
      'button.btn-green',
      'button[class*="auto-confirm"]',
      'button[class*="confirm"][class*="green"]',
      'button.green-btn'
    ];
    
    for (const selector of greenButtonSelectors) {
      const buttons = await page.$$(selector);
      for (const button of buttons) {
        try {
          const text = await page.evaluate(el => el.textContent, button);
          if (text && (text.toLowerCase().includes('auto') || text.toLowerCase().includes('confirm'))) {
            buttonText = text.trim();
            log(`  ✓ Found confirm button: "${buttonText}"`, 'green');
            await button.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await wait(500);
            await button.click();
            submitted = true;
            isAutoConfirm = text.toLowerCase().includes('auto');
            break;
          }
        } catch (error) {
          continue;
        }
      }
      if (submitted) break;
    }
  }
  
  // Strategy 3: Look for any button in the top right area with "Done" or "Confirm" text
  if (!submitted) {
    log(`  Looking for alternative confirm buttons...`, 'yellow');
    
    const altButtonsHandle = await page.evaluateHandle(() => {
      const candidates = Array.from(document.querySelectorAll('button, a[role="button"], [role="button"]'));
      const needleRegex = /(done|confirm|submit)/i;
      return candidates.filter(el => {
        const label = (el.innerText || el.textContent || '').trim();
        return needleRegex.test(label);
      });
    });
    
    const properties = await altButtonsHandle.getProperties();
    const altButtons = [];
    for (const property of properties.values()) {
      const el = property.asElement();
      if (el) altButtons.push(el);
    }
    await altButtonsHandle.dispose();
    
    for (const button of altButtons) {
      try {
        const buttonInfo = await page.evaluate(el => {
          const rect = el.getBoundingClientRect();
          const text = (el.textContent || '').trim();
          const computedStyle = window.getComputedStyle(el);
          const bgColor = computedStyle.backgroundColor;
          
          return {
            text,
            x: rect.x,
            y: rect.y,
            bgColor,
            width: rect.width,
            height: rect.height
          };
        }, button);
        
        log(`  Found button: "${buttonInfo.text}" at position (${Math.round(buttonInfo.x)}, ${Math.round(buttonInfo.y)})`, 'dim');
        
        // Look for buttons in the top right (high X value, low Y value)
        const windowWidth = await page.evaluate(() => window.innerWidth);
        const isTopRight = buttonInfo.x > (windowWidth * 0.7) && buttonInfo.y < 300;
        
        if (isTopRight || buttonInfo.text.toLowerCase().includes('done')) {
          buttonText = buttonInfo.text;
          log(`  ✓ Found button in top right: "${buttonText}"`, 'cyan');
          await button.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
          await wait(500);
          await button.click();
          submitted = true;
          isAutoConfirm = buttonText.toLowerCase().includes('auto');
          break;
        }
      } catch (error) {
        continue;
      }
    }
  }
  
  if (!submitted) {
    // Take a screenshot to help debug
    await takeScreenshot(page, '04_submit_button_not_found');
    throw new Error("Could not find AUTO-CONFIRM or confirm button. Check screenshot: 04_submit_button_not_found*.png");
  }
  
  log(`  ✓ Clicked confirmation button: "${buttonText}"`, 'dim');
  
  // Wait for confirmation to process
  await wait(3000);
  
  await takeScreenshot(page, '04_booking_submitted');
  logStep(4, `Booking ${isAutoConfirm ? 'AUTO-CONFIRMED' : 'submitted'}!`, 'success');
  
  return {
    buttonText: buttonText,
    isAutoConfirm: isAutoConfirm
  };
}

// ==================== STEP 5: VERIFY CONFIRMATION ====================
async function verifyConfirmation(page) {
  logStep(5, "Verifying booking confirmation", 'info');
  
  await wait(2500);
  
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
  let detectedListingId = 'Unknown';
  let bookingPageUrl = '';
  
  try {
    console.clear();
    log("\n" + "=".repeat(70), 'cyan');
    log("  🤖 BROKER BAY ENHANCED AUTO-BOOKING SCRIPT", 'cyan');
    log("=".repeat(70) + "\n", 'cyan');
    log(`Property: ${propertyAddress}`, 'bright');
    log(`User: ${USER_PROFILE.name} (${USER_PROFILE.email})`, 'dim');
    log(`Preferred Duration: ${USER_PROFILE.preferredDuration} minutes`, 'dim');
    log(`Auto-Confirm Only: ${USER_PROFILE.autoConfirmOnly ? 'YES' : 'NO'}`, 'dim');
    log(`\nSearch Query: ${propertyAddress}\n`, 'dim');
    
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
    
    // Navigate to dashboard
    logStep("0.6", "Navigating to BrokerBay dashboard", 'info');
    await page.goto(BROKERBAY_DASHBOARD, { 
      waitUntil: 'networkidle2',
      timeout: CONFIG.navigationTimeout 
    });
    await wait(CONFIG.pageLoadWait);
    logStep("0.6", "Dashboard loaded", 'success');
    
    // Search for property
    await searchForProperty(page, propertyAddress);
    
    // Select property from search results (may open in same or new tab)
    const listingPage = await selectPropertyFromResults(page, propertyAddress);
    
    // Extract listing ID from property page URL
    const listingIdFromUrl = extractListingIdFromUrl(listingPage);
    if (listingIdFromUrl) {
      detectedListingId = listingIdFromUrl;
      log(`  ✓ Detected Listing ID: ${detectedListingId}`, 'dim');
    } else {
      log(`  ⚠️ Could not detect listing ID from URL: ${listingPage.url()}`, 'yellow');
    }
    
    // Click "Book Showing" button on property page
    await clickBookShowingButton(listingPage);
    bookingPageUrl = listingPage.url();
    log(`  📄 Booking URL: ${bookingPageUrl}`, 'dim');
    
    // Now we're on the booking page - execute booking steps
    await fillProfileStep(listingPage);
    await selectDateStep(listingPage, preferredDateArg);
    const timeInfo = await selectTimeAndDurationStep(listingPage);
    const submitResult = await submitBooking(listingPage);
    const confirmation = await verifyConfirmation(listingPage);
    const autoConfirmed = Boolean(submitResult.isAutoConfirm || timeInfo.autoConfirm);
    const bookingStatus = confirmation.isConfirmed || autoConfirmed ? 'Confirmed' : 'Pending';
    
    // Extract booking date from page
    const bookingDate = await page.evaluate(() => {
      // Try to find selected date in various ways
      const selectedDate = document.querySelector('.selected, .active, [class*="selected"]');
      return selectedDate ? selectedDate.textContent.trim() : new Date().toLocaleDateString();
    });
    
    // Save to database
    logStep(6, "Saving booking to database", 'info');
    
    const bookingData = {
      listing_id: detectedListingId,
      property_address: propertyAddress,
      booking_date: bookingDate || new Date().toISOString().split('T')[0],
      booking_time: timeInfo.time,
      duration: timeInfo.duration,
      user_name: USER_PROFILE.name,
      user_email: USER_PROFILE.email,
      organization: USER_PROFILE.organization,
      showing_type: USER_PROFILE.showingType,
      status: bookingStatus,
      auto_confirmed: autoConfirmed,
      booking_url: bookingPageUrl || page.url(),
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
    log(`🆔 Listing ID: ${detectedListingId}`, 'white');
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

