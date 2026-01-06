#!/usr/bin/env node

import { configDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import Database from "better-sqlite3";
import { spawn } from "child_process";
import axios from "axios";

configDotenv();

const supabaseUrl = process.env.SUPABASE_PROJECT_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase credentials.");
  console.error("Set SUPABASE_PROJECT_URL and SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const db = new Database("src/data/data.db");

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  const timestamp = new Date().toISOString();
  console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

const bookingQueue = [];
let isProcessing = false;

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

function normalizeAddressForSearch(address) {
  if (!address || typeof address !== "string") return "";
  const firstComma = address.indexOf(",");
  const truncated = firstComma >= 0 ? address.slice(0, firstComma) : address;
  return truncated.trim();
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

async function fetchAndSavePropertyAddress(propertyId) {
  const existing = db.prepare("SELECT address FROM properties WHERE property_id = ?").get(propertyId);
  
  if (existing && existing.address) {
    log(`  ✓ Address already cached: ${existing.address}`, 'cyan');
    return existing.address;
  }

  const url = `https://property-api-6nkd.onrender.com/api/properties/${encodeURIComponent(propertyId)}`;
  
  try {
    const res = await axios.get(url, { timeout: 15000 });
    const rawAddress = extractAddress(res.data);
    
    if (!rawAddress) {
      throw new Error("No address field in payload");
    }

    const searchAddress = normalizeAddressForSearch(rawAddress);
    
    const upsertStmt = db.prepare(`
      INSERT INTO properties (property_id, address)
      VALUES (?, ?)
      ON CONFLICT(property_id) DO UPDATE SET address = excluded.address
    `);
    
    upsertStmt.run(propertyId, searchAddress || rawAddress);
    
    log(`  ✓ Fetched address: ${searchAddress || rawAddress}`, 'green');
    return searchAddress || rawAddress;
  } catch (err) {
    log(`  ❌ Failed to fetch address for ${propertyId}: ${err.message}`, 'red');
    return null;
  }
}

function runAutoBooking(address, preferredTime = "8:00 PM", preferredDate = null) {
  return new Promise((resolve) => {
    log(`  🚀 Starting auto-book: ${address} at ${preferredTime}`, 'blue');

    const currentDate = new Date();
    const dayOfMonth = preferredDate || currentDate.getDate().toString();

    const args = ["auto-book-enhanced.js", address, preferredTime, dayOfMonth];

    const child = spawn("node", args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HEADLESS: "true",
        AUTO_CONFIRM_ONLY: "false"
      }
    });

    let output = '';

    child.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      text.split('\n').filter(Boolean).forEach(line => {
        log(`    📝 ${line}`, 'cyan');
      });
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      output += text;
      log(`    ⚠️  ${text}`, 'yellow');
    });

    child.on("close", (code) => {
      if (code === 0) {
        log(`  ✅ Auto-booking completed successfully`, 'green');
        resolve({ success: true, output });
      } else {
        log(`  ❌ Auto-booking failed with exit code ${code}`, 'red');
        resolve({ success: false, output });
      }
    });

    child.on("error", (error) => {
      log(`  ❌ Auto-booking process error: ${error.message}`, 'red');
      resolve({ success: false, output: error.message });
    });
  });
}

async function processBookingQueue() {
  if (isProcessing || bookingQueue.length === 0) {
    return;
  }

  isProcessing = true;

  while (bookingQueue.length > 0) {
    const booking = bookingQueue.shift();
    
    log(`\n${'='.repeat(70)}`, 'bright');
    log(`📦 Processing booking ${booking.requestId}`, 'bright');
    log(`   Property ID: ${booking.propertyId}`, 'cyan');
    log(`   Queue remaining: ${bookingQueue.length}`, 'cyan');
    log('='.repeat(70), 'bright');

    const address = await fetchAndSavePropertyAddress(booking.propertyId);
    
    if (!address) {
      log(`  ⚠️  Skipping booking - no address available`, 'yellow');
      
      db.prepare(`
        UPDATE processed_showing_requests 
        SET auto_booked = 1, booking_status = 'failed_no_address'
        WHERE id = ?
      `).run(booking.requestId);
      
      continue;
    }

    const result = await runAutoBooking(address, "8:00 PM", null);

    db.prepare(`
      UPDATE processed_showing_requests 
      SET auto_booked = 1, booking_status = ?
      WHERE id = ?
    `).run(result.success ? 'completed' : 'failed', booking.requestId);

    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  isProcessing = false;
  log(`\n✅ Queue processed. Waiting for new records...\n`, 'green');
}

function queueBooking(request) {
  if (isAlreadyProcessed(request.id)) {
    log(`  ⏭️  Already processed: ${request.id}`, 'yellow');
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

  log(`  ➕ Added to queue: ${request.property_id} (Queue size: ${bookingQueue.length})`, 'green');
  
  processBookingQueue();
}

function startRealtimeListener() {
  log('', 'reset');
  log('╔═══════════════════════════════════════════════════════════╗', 'cyan');
  log('║    🤖 Auto-Booking Worker Started (Event-Driven Mode)    ║', 'cyan');
  log('╚═══════════════════════════════════════════════════════════╝', 'cyan');
  log('', 'reset');
  log('🎯 Listening for new showing_requests in Supabase...', 'blue');
  log('⏰ Default booking time: 8:00 PM', 'blue');
  log('📅 Default booking date: Current day', 'blue');
  log('', 'reset');

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
        log('\n🔔 New showing request detected!', 'green');
        log(`   ID: ${payload.new.id}`, 'cyan');
        log(`   Property ID: ${payload.new.property_id}`, 'cyan');
        log(`   Status: ${payload.new.status}`, 'cyan');
        
        queueBooking(payload.new);
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        log('✅ Successfully subscribed to showing_requests changes', 'green');
        log('   Waiting for INSERT events...\n', 'cyan');
      } else if (status === 'CHANNEL_ERROR') {
        log('❌ Error subscribing to Supabase Realtime', 'red');
      }
    });

  return channel;
}

async function fetchExistingUnprocessedRequests() {
  log('🔍 Checking for existing unprocessed showing requests...', 'blue');
  
  const processedIds = db.prepare("SELECT id FROM processed_showing_requests").all().map(r => r.id);
  
  const { data, error } = await supabase
    .from("showing_requests")
    .select("id, user_id, property_id, status, created_at, scheduled_date, scheduled_time, group_name")
    .in("status", ["pending", "scheduled", "rescheduled"])
    .order("created_at", { ascending: true });

  if (error) {
    log(`  ⚠️  Error fetching existing requests: ${error.message}`, 'yellow');
    return;
  }

  const unprocessed = data.filter(r => !processedIds.includes(r.id));
  
  if (unprocessed.length === 0) {
    log('  ✓ No unprocessed requests found', 'green');
    return;
  }

  log(`  📋 Found ${unprocessed.length} unprocessed request(s)`, 'green');
  
  unprocessed.forEach(request => {
    queueBooking(request);
  });
}

async function main() {
  try {
    ensureTables();
    
    await fetchExistingUnprocessedRequests();
    
    const channel = startRealtimeListener();
    
    process.on('SIGINT', () => {
      log('\n\n👋 Shutting down auto-booking worker...', 'yellow');
      channel.unsubscribe();
      db.close();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      log('\n\n👋 Shutting down auto-booking worker...', 'yellow');
      channel.unsubscribe();
      db.close();
      process.exit(0);
    });

  } catch (err) {
    log(`💥 Fatal error: ${err.message}`, 'red');
    log(err.stack, 'red');
    db.close();
    process.exit(1);
  }
}

main();

