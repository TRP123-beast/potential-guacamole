#!/usr/bin/env node

/**
 * ===========================================================================
 *  AUTO-BOOKING WORKER (v3 — In-Process Booking, Scheduled Only)
 * ===========================================================================
 *
 *  Architecture:
 *    1. Initializes a SHARED headless Chromium browser (singleton via session-manager)
 *    2. Listens for INSERT events on the Supabase `showing_requests` table
 *    3. For each new showing request with status "scheduled":
 *       a) Fetches the property address from the property API
 *       b) Runs the booking flow IN-PROCESS (via runBookingFlow from auto-book-enhanced)
 *       c) Updates the local SQLite database with booking status
 *    4. Periodically checks browser health and restarts if needed
 *
 *  Key behaviours:
 *    - Only processes showing requests with status "scheduled"
 *    - No child process spawning — booking runs in the same process using shared browser
 *    - Structured logging with [WORKER], [BOOKING], [QUEUE], [SUPABASE] prefixes
 *    - Browser health monitoring and auto-recovery
 *
 * ===========================================================================
 */

import { configDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import Database from "better-sqlite3";
import axios from "axios";
import { getSharedBrowser, closeSharedBrowser, isBrowserAlive } from "./src/session-manager.js";
import { runBookingFlow } from "./auto-book-enhanced.js";
// import { runCancellationSweep } from "./auto-cancel-showings.js";

configDotenv();

// ==================== SUPABASE SETUP ====================
const supabaseUrl = process.env.SUPABASE_PROJECT_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

const supabaseKey = supabaseServiceKey || supabaseAnonKey;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ [WORKER] Missing Supabase credentials.");
  console.error("Set SUPABASE_PROJECT_URL and SUPABASE_SERVICE_ROLE_KEY in environment (anon key as fallback).");
  process.exit(1);
}

if (supabaseServiceKey) {
  console.log("🔑 [WORKER] Using Supabase SERVICE ROLE key for Realtime subscriptions.");
} else {
  console.log("⚠️  [WORKER] No SUPABASE_SERVICE_ROLE_KEY set. Falling back to ANON key (may fail with Realtime/RLS).");
}

// Ensure WebSocket is available in Node
if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket;
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    heartbeatIntervalMs: 10000,
    retryAttempts: 10,
    retryInterval: 2000,
  },
});
const db = new Database("src/data/data.db");

// ==================== CONFIGURATION ====================
const BROWSER_HEALTH_CHECK_MS = 60000; // Check browser health every 60s

// ==================== LOGGING ====================
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
};

function log(message, color = 'reset') {
  const timestamp = new Date().toISOString();
  console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

// ==================== BOOKING QUEUE ====================
const bookingQueue = [];
let isProcessing = false;
const failedAddressFetches = new Map();
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 60000;

// ==================== SHARED BROWSER INSTANCE ====================
let sharedBrowser = null;

async function ensureBrowser() {
  if (isBrowserAlive()) {
    return sharedBrowser;
  }

  log('🌐 [WORKER] Initializing shared browser...', 'blue');
  try {
    sharedBrowser = await getSharedBrowser({
      headless: process.env.HEADLESS !== 'false',
      defaultViewport: { width: 1920, height: 1080 },
    });
    log('✅ [WORKER] Shared browser ready', 'green');
    return sharedBrowser;
  } catch (err) {
    log(`❌ [WORKER] Failed to initialize browser: ${err.message}`, 'red');
    throw err;
  }
}

// ==================== DATABASE SETUP ====================
function ensureTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS processed_showing_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      property_id TEXT NOT NULL,
      status TEXT,
      group_name TEXT,
      scheduled_date TEXT,
      scheduled_time TEXT,
      created_at TEXT,
      processed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      auto_booked INTEGER DEFAULT 0,
      booking_status TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS properties (
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
      details_json TEXT,
      rooms_json TEXT,
      url TEXT,
      property_type TEXT,
      year_built INTEGER,
      lot_size TEXT,
      parking_spaces INTEGER,
      organization TEXT,
      organization_address TEXT,
      UNIQUE(property_id)
    );
  `);

  const columns = db.prepare("PRAGMA table_info(processed_showing_requests)").all();
  const columnNames = columns.map((c) => c.name);

  if (!columnNames.includes("auto_booked")) {
    db.exec("ALTER TABLE processed_showing_requests ADD COLUMN auto_booked INTEGER DEFAULT 0;");
  }
  if (!columnNames.includes("booking_status")) {
    db.exec("ALTER TABLE processed_showing_requests ADD COLUMN booking_status TEXT;");
  }
}

function isAlreadyProcessed(requestId) {
  const row = db.prepare("SELECT id FROM processed_showing_requests WHERE id = ?").get(requestId);
  return Boolean(row);
}

function saveShowingRequest(request) {
  const stmt = db.prepare(`
    INSERT INTO processed_showing_requests (
      id, user_id, property_id, status, group_name, 
      scheduled_date, scheduled_time, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    request.id,
    request.user_id ?? null,
    request.property_id,
    request.status ?? null,
    request.group_name ?? null,
    request.scheduled_date ?? null,
    request.scheduled_time ?? null,
    request.created_at ?? null
  );
}

// ==================== ADDRESS UTILITIES ====================
function normalizeAddressForSearch(address) {
  if (!address || typeof address !== "string") return "";
  const firstComma = address.indexOf(",");
  const truncated = firstComma >= 0 ? address.slice(0, firstComma) : address;
  return truncated.trim();
}

function addBrokerBayHash(address) {
  if (!address || typeof address !== "string") return address;
  const trimmed = address.trim();
  if (trimmed.includes("#")) return trimmed;

  const patterns = [
    /(.*?)(unit\s+[a-z0-9]+(?:\s+[\w-]+)*)$/i,
    /(.*?)(suite\s+[a-z0-9]+(?:\s+[\w-]+)*)$/i,
    /(.*?)(main floor|first floor|second floor|2nd floor|third floor|3rd floor|fourth floor|4th floor|upper level|lower level|upper|lower|main)$/i,
  ];

  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) {
      const prefix = m[1].trim();
      const suffix = m[2].trim();
      return `${prefix} #${suffix}`;
    }
  }

  const tokens = trimmed.split(/\s+/);
  if (tokens.length > 2) {
    const last = tokens[tokens.length - 1];
    const first = tokens[0];
    const lastIsNum = /^[0-9]+[a-z]?$/i.test(last);
    const firstIsNum = /^[0-9]+/.test(first);
    if (lastIsNum && firstIsNum) {
      const prefix = tokens.slice(0, -1).join(" ");
      return `${prefix} #${last}`;
    }
  }

  return trimmed;
}

function extractAddress(payload) {
  if (!payload) return null;
  if (typeof payload === "string") return payload;

  if (typeof payload.address === "string") return payload.address;
  if (payload.address && typeof payload.address === "object") {
    const addr = payload.address;
    if (typeof addr.unparsedAddress === "string") {
      return addr.unparsedAddress;
    }
    if (typeof addr.street === "string") {
      const parts = [addr.street, addr.city, addr.state, addr.postalCode].filter(Boolean);
      if (parts.length) return parts.join(", ");
      return addr.street;
    }
  }

  if (Array.isArray(payload) && payload.length) {
    const first = payload[0];
    if (first && typeof first.address === "string") return first.address;
  }

  if (payload.data) {
    const nested = extractAddress(payload.data);
    if (nested) return nested;
  }

  if (payload.property) {
    const nested = extractAddress(payload.property);
    if (nested) return nested;
  }

  return null;
}

async function fetchAndSavePropertyAddress(propertyId, retryCount = 0) {
  const existing = db.prepare("SELECT address FROM properties WHERE property_id = ?").get(propertyId);

  if (existing && existing.address) {
    log(`  ✓ [QUEUE] Address cached: ${existing.address}`, 'cyan');
    failedAddressFetches.delete(propertyId);
    return existing.address;
  }

  const url = `https://property-api-6nkd.onrender.com/api/properties/${encodeURIComponent(propertyId)}`;

  try {
    const res = await axios.get(url, { timeout: 20000 });
    const rawAddress = extractAddress(res.data);

    if (!rawAddress) {
      throw new Error("No address field in payload");
    }

    const searchAddress = normalizeAddressForSearch(rawAddress);
    const hashedAddress = addBrokerBayHash(searchAddress || rawAddress);

    const upsertStmt = db.prepare(`
      INSERT INTO properties (property_id, address)
      VALUES (?, ?)
      ON CONFLICT(property_id) DO UPDATE SET address = excluded.address
    `);

    upsertStmt.run(propertyId, hashedAddress);

    if (hashedAddress !== searchAddress) {
      log(`  🔎 [QUEUE] Adjusted for BrokerBay: "${hashedAddress}" (from "${searchAddress}")`, 'blue');
    }
    log(`  ✓ [QUEUE] Fetched address: ${hashedAddress}`, 'green');
    failedAddressFetches.delete(propertyId);
    return hashedAddress;
  } catch (err) {
    log(`  ❌ [QUEUE] Failed to fetch address for ${propertyId} (attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS}): ${err.message}`, 'red');

    if (retryCount < MAX_RETRY_ATTEMPTS - 1) {
      failedAddressFetches.set(propertyId, {
        attempts: retryCount + 1,
        lastAttempt: Date.now(),
        error: err.message
      });
      log(`  🔄 [QUEUE] Will retry fetching address for ${propertyId} later...`, 'yellow');
    } else {
      log(`  ⚠️  [QUEUE] Max retry attempts reached for ${propertyId}. Marking as failed.`, 'yellow');
      failedAddressFetches.set(propertyId, {
        attempts: retryCount + 1,
        lastAttempt: Date.now(),
        error: err.message,
        maxRetriesReached: true
      });
    }

    return null;
  }
}

// ==================== IN-PROCESS BOOKING ====================
async function runAutoBooking(address, preferredTime = "8:00 PM", preferredDate = null) {
  log(`  🚀 [BOOKING] Starting in-process booking: ${address} at ${preferredTime}`, 'blue');

  try {
    const browser = await ensureBrowser();

    const result = await runBookingFlow(browser, {
      address,
      preferredTime,
      preferredDate: preferredDate || '',
      preferredDuration: 60
    });

    if (result.success) {
      log(`  ✅ [BOOKING] Completed successfully (ID: ${result.bookingId})`, 'green');
    } else {
      log(`  ❌ [BOOKING] Failed: ${result.error}`, 'red');
    }

    return result;
  } catch (error) {
    log(`  ❌ [BOOKING] Process error: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

// ==================== QUEUE PROCESSING ====================
async function processBookingQueue() {
  if (isProcessing || bookingQueue.length === 0) {
    return;
  }

  isProcessing = true;

  while (bookingQueue.length > 0) {
    const booking = bookingQueue.shift();

    log(`\n${'='.repeat(70)}`, 'bright');
    log(`📦 [QUEUE] Processing booking ${booking.requestId}`, 'bright');
    log(`   Property ID: ${booking.propertyId}`, 'cyan');
    log(`   Queue remaining: ${bookingQueue.length}`, 'cyan');
    log('='.repeat(70), 'bright');

    try {
      const failedInfo = failedAddressFetches.get(booking.propertyId);
      const retryCount = failedInfo?.attempts || 0;

      const address = await fetchAndSavePropertyAddress(booking.propertyId, retryCount);

      if (!address) {
        const shouldRetry = retryCount < MAX_RETRY_ATTEMPTS - 1;

        if (shouldRetry) {
          log(`  🔄 [QUEUE] Re-queuing ${booking.propertyId} for retry (attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`, 'yellow');
          bookingQueue.push(booking);

          db.prepare(`
            UPDATE processed_showing_requests 
            SET booking_status = 'retry_pending'
            WHERE id = ?
          `).run(booking.requestId);
        } else {
          log(`  ⚠️  [QUEUE] Skipping booking - max retry attempts reached for ${booking.propertyId}`, 'yellow');

          db.prepare(`
            UPDATE processed_showing_requests 
            SET auto_booked = 1, booking_status = 'failed_no_address'
            WHERE id = ?
          `).run(booking.requestId);
        }

        continue;
      }

      log(`  🚀 [QUEUE] Starting auto-booking for: ${address}`, 'blue');
      const result = await runAutoBooking(address, "8:00 PM", null);

      if (result.success) {
        db.prepare(`
          UPDATE processed_showing_requests 
          SET auto_booked = 1, booking_status = 'completed'
          WHERE id = ?
        `).run(booking.requestId);
        log(`  ✅ [QUEUE] Booking completed for ${booking.propertyId}`, 'green');
      } else {
        db.prepare(`
          UPDATE processed_showing_requests 
          SET auto_booked = 1, booking_status = 'failed_booking_error'
          WHERE id = ?
        `).run(booking.requestId);
        log(`  ❌ [QUEUE] Booking failed for ${booking.propertyId}`, 'red');
      }

    } catch (error) {
      log(`  ❌ [QUEUE] Unexpected error processing ${booking.propertyId}: ${error.message}`, 'red');

      db.prepare(`
        UPDATE processed_showing_requests 
        SET auto_booked = 1, booking_status = 'failed_unexpected_error'
        WHERE id = ?
      `).run(booking.requestId);
    }

    // Wait between bookings to avoid rate-limiting
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  isProcessing = false;

  const failedCount = Array.from(failedAddressFetches.values()).filter(f => !f.maxRetriesReached).length;
  if (failedCount > 0) {
    log(`\n⚠️  [QUEUE] Queue processed. ${failedCount} item(s) pending retry. Waiting for new records...\n`, 'yellow');
  } else {
    log(`\n✅ [QUEUE] Queue processed. Waiting for new records...\n`, 'green');
  }

}

function queueBooking(request) {
  // Only auto-book requests with status "scheduled"
  const status = (request.status || "").toLowerCase();
  if (status !== "scheduled") {
    log(`  ⏭️  [QUEUE] Skipping — status "${request.status}" is not "scheduled": ${request.id}`, 'yellow');
    return;
  }

  if (isAlreadyProcessed(request.id)) {
    log(`  ⏭️  [QUEUE] Already processed: ${request.id}`, 'yellow');
    return;
  }

  saveShowingRequest(request);

  bookingQueue.push({
    requestId: request.id,
    propertyId: request.property_id,
    userId: request.user_id,
    status: request.status,
    createdAt: request.created_at
  });

  log(`  ➕ [QUEUE] Added to queue: ${request.property_id} (Queue size: ${bookingQueue.length})`, 'green');

  processBookingQueue();
}

// ==================== RETRY FAILED ADDRESS FETCHES ====================
async function retryFailedAddressFetches() {
  const now = Date.now();
  const toRetry = [];

  for (const [propertyId, info] of failedAddressFetches.entries()) {
    if (!info.maxRetriesReached && (now - info.lastAttempt) >= RETRY_DELAY_MS) {
      toRetry.push(propertyId);
    }
  }

  if (toRetry.length > 0) {
    log(`\n🔄 [QUEUE] Retrying ${toRetry.length} failed address fetch(es)...`, 'yellow');

    for (const propertyId of toRetry) {
      const pending = db.prepare(`
        SELECT * FROM processed_showing_requests 
        WHERE property_id = ? AND booking_status = 'retry_pending'
        ORDER BY created_at
        LIMIT 1
      `).get(propertyId);

      if (pending) {
        log(`  🔄 [QUEUE] Re-queuing ${propertyId} for retry`, 'cyan');
        queueBooking(pending);
      }
    }
  }
}

// ==================== BROWSER HEALTH CHECK ====================
async function checkBrowserHealth() {
  if (!isBrowserAlive()) {
    log('⚠️  [WORKER] Browser disconnected! Attempting to reconnect...', 'yellow');
    try {
      sharedBrowser = await ensureBrowser();
      log('✅ [WORKER] Browser reconnected successfully', 'green');
    } catch (err) {
      log(`❌ [WORKER] Browser reconnection failed: ${err.message}`, 'red');
    }
  }
}

// ==================== SUPABASE REALTIME LISTENER ====================
function startRealtimeListener() {
  log('', 'reset');
  log('╔═══════════════════════════════════════════════════════════════════╗', 'cyan');
  log('║  🤖 Auto-Booking Worker v3 (In-Process, Scheduled Only)         ║', 'cyan');
  log('╚═══════════════════════════════════════════════════════════════════╝', 'cyan');
  log('', 'reset');
  log('🎯 [SUPABASE] Listening for new showing_requests insertions (status: "scheduled" only)...', 'blue');
  log('⏰ [WORKER] Default booking time: 8:00 PM', 'blue');
  log('📅 [WORKER] Default booking date: Current day', 'blue');
  log('🔄 [WORKER] Retry failed address fetches: Every 60 seconds', 'blue');
  log(`🌐 [WORKER] Browser mode: ${process.env.HEADLESS !== 'false' ? 'Headless' : 'Visible'}`, 'blue');
  log('', 'reset');

  let consecutiveTimeouts = 0;

  const channel = supabase
    .channel('showing_requests_changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'showing_requests'
      },
      (payload) => {
        log('\n🔔 [SUPABASE] New showing request detected!', 'green');
        log(`   ID: ${payload.new.id}`, 'cyan');
        log(`   Property ID: ${payload.new.property_id}`, 'cyan');
        log(`   Status: ${payload.new.status}`, 'cyan');

        if ((payload.new.status || "").toLowerCase() !== "scheduled") {
          log(`   ⏭️  Ignoring — only "scheduled" status triggers auto-booking`, 'yellow');
          return;
        }

        queueBooking(payload.new);
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        consecutiveTimeouts = 0;
        log('✅ [SUPABASE] Successfully subscribed to showing_requests changes', 'green');
        log('   Waiting for INSERT events...\n', 'cyan');
      } else if (status === 'CHANNEL_ERROR') {
        log('❌ [SUPABASE] Error subscribing to Realtime', 'red');
        if (err) {
          log(`   Error details: ${err.message || JSON.stringify(err)}`, 'red');
        }
        log('   Check: 1) Realtime enabled? 2) Publication exists? 3) Correct credentials?', 'yellow');
      } else if (status === 'TIMED_OUT') {
        log('⏱️  [SUPABASE] Subscription timed out. Retrying...', 'yellow');
        consecutiveTimeouts += 1;
        if (consecutiveTimeouts >= 3) {
          log('❌ [SUPABASE] Too many consecutive timeouts. Exiting so the process restarts.', 'red');
          process.exit(1);
        }
      } else if (status === 'CLOSED') {
        log('🔌 [SUPABASE] Subscription closed. Attempting to reconnect...', 'yellow');
      } else {
        log(`📡 [SUPABASE] Subscription status: ${status}`, 'cyan');
      }
    });

  // Retry failed address fetches every RETRY_DELAY_MS
  setInterval(() => {
    retryFailedAddressFetches();
  }, RETRY_DELAY_MS);

  // Browser health check
  setInterval(() => {
    checkBrowserHealth();
  }, BROWSER_HEALTH_CHECK_MS);

  return channel;
}

// ==================== FETCH EXISTING UNPROCESSED REQUESTS ====================
async function fetchExistingUnprocessedRequests() {
  log('🔍 [WORKER] Checking for existing unprocessed showing requests...', 'blue');

  const processedIds = db.prepare("SELECT id FROM processed_showing_requests").all().map(r => r.id);

  const { data, error } = await supabase
    .from("showing_requests")
    .select("id, user_id, property_id, status, created_at, scheduled_date, scheduled_time, group_name")
    .eq("status", "scheduled")
    .order("created_at", { ascending: true });

  if (error) {
    log(`  ⚠️  [WORKER] Error fetching existing requests: ${error.message}`, 'yellow');
    return;
  }

  const unprocessed = data.filter(r => !processedIds.includes(r.id));

  if (unprocessed.length === 0) {
    log('  ✓ [WORKER] No unprocessed requests found', 'green');
    return;
  }

  log(`  📋 [WORKER] Found ${unprocessed.length} unprocessed request(s)`, 'green');

  unprocessed.forEach(request => {
    queueBooking(request);
  });
}

// ==================== MAIN ENTRY POINT ====================
async function main() {
  try {
    ensureTables();

    // Initialize the shared browser before starting anything
    log('🌐 [WORKER] Initializing shared browser before processing...', 'blue');
    await ensureBrowser();

    // Fetch any unprocessed requests from Supabase
    await fetchExistingUnprocessedRequests();

    // Start the realtime listener (also schedules auto-cancel + health checks)
    const channel = startRealtimeListener();

    // Graceful shutdown
    const shutdown = async () => {
      log('\n\n👋 [WORKER] Shutting down auto-booking worker...', 'yellow');
      channel.unsubscribe();
      await closeSharedBrowser();
      db.close();
      log('✅ [WORKER] Shutdown complete', 'green');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (err) {
    log(`💥 [WORKER] Fatal error: ${err.message}`, 'red');
    log(err.stack, 'red');
    await closeSharedBrowser();
    db.close();
    process.exit(1);
  }
}

main();
