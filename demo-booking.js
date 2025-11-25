#!/usr/bin/env node

import { configDotenv } from "dotenv";
import Database from "better-sqlite3";
import OpenAI from "openai";

configDotenv();

// ---- CLI: listing ID argument parsing & validation ----
const rawArg = process.argv.slice(2).join(' ').trim();
const DEFAULT_LISTING_ID = "690cd551dd200098294edd18";

function parseListingArgument() {
  let listingId = rawArg || DEFAULT_LISTING_ID;
  
  // Validate listing ID format (24-character hex string for MongoDB ObjectId)
  if (!/^[a-f0-9]{24}$/i.test(listingId)) {
    console.log("\n⚠️  Invalid listing ID format. Using default: " + DEFAULT_LISTING_ID);
    listingId = DEFAULT_LISTING_ID;
  }
  
  return {
    listingId: listingId,
    bookingUrl: `https://edge.brokerbay.com/#/listing/${listingId}/appointments/book`
  };
}

const CLI_LISTING = parseListingArgument();

// ANSI color codes for beautiful CLI output
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
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
  bgMagenta: '\x1b[45m'
};

// Utility functions for beautiful output
function printHeader(text, color = 'blue') {
  console.log(`\n${colors[color]}${colors.bright}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors[color]}${colors.bright}  ${text}${colors.reset}`);
  console.log(`${colors[color]}${'='.repeat(60)}${colors.reset}\n`);
}

function printStep(step, description, status = 'info') {
  const statusIcon = status === 'success' ? '✅' : status === 'error' ? '❌' : status === 'warning' ? '⚠️' : '🔍';
  const statusColor = status === 'success' ? 'green' : status === 'error' ? 'red' : status === 'warning' ? 'yellow' : 'cyan';
  
  console.log(`${colors[statusColor]}${statusIcon} Step ${step}: ${description}${colors.reset}`);
}

function printData(label, value, color = 'white') {
  console.log(`${colors.dim}${label}:${colors.reset} ${colors[color]}${value}${colors.reset}`);
}

function printTable(data, title) {
  console.log(`\n${colors.bright}${colors.cyan}${title}${colors.reset}`);
  console.log(`${colors.dim}${'-'.repeat(50)}${colors.reset}`);
  
  Object.entries(data).forEach(([key, value]) => {
    const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    printData(formattedKey, value, 'white');
  });
}

function printProgressBar(current, total, width = 40) {
  const percentage = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  
  process.stdout.write(`\r${colors.cyan}[${bar}] ${percentage}%${colors.reset}`);
  if (current === total) console.log();
}

// Demo data
const DEMO_USER_PROFILE = {
  name: "NAHEED VALYANI",
  organization: "HOMELIFE/YORKLAND REAL ESTATE LTD.",
  organization_address: "150 WYNFORD DR, #125, TORONTO, ON, M3C1K6",
  email: "naheed.val@gmail.com",
  showing_type: "Buyer/Broker"
};

const DEMO_PROPERTY = {
  address: "50 O'Neill Road #1911",
  listingId: CLI_LISTING.listingId
};

// Database operations
function setupDatabase() {
  const db = new Database("src/data/data.db");
  try { db.pragma('foreign_keys = OFF'); } catch { db.exec("PRAGMA foreign_keys = OFF"); }
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      listing_id TEXT,
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
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

function insertBooking(bookingData) {
  const db = setupDatabase();
  try {
    const insertStmt = db.prepare(`
      INSERT INTO bookings (
        listing_id, booking_date, booking_time, duration, user_name, user_email,
        organization, showing_type, status, auto_confirmed, booking_url
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `);
    
    insertStmt.run(
      bookingData.listing_id,
      bookingData.booking_date,
      bookingData.booking_time,
      bookingData.duration,
      bookingData.user_name,
      bookingData.user_email,
      bookingData.organization,
      bookingData.showing_type,
      bookingData.status,
      bookingData.auto_confirmed ? 1 : 0,
      bookingData.booking_url
    );
    
    return true;
  } catch (error) {
    console.error(`Database error: ${error.message}`);
    return false;
  } finally {
    db.close();
  }
}

function getAllBookings() {
  const db = setupDatabase();
  try {
    const query = "SELECT * FROM bookings ORDER BY created_at DESC";
    const result = db.prepare(query).all();
    return result;
  } catch (error) {
    console.error(`Database error: ${error.message}`);
    return [];
  } finally {
    db.close();
  }
}

// Main demo function
async function runDemo() {
  console.clear();
  
  printHeader("📅 BROKER BAY AUTO-BOOKING DEMO", 'bgBlue');
  console.log(`${colors.bright}${colors.white}Simulating automatic showing booking${colors.reset}`);
  console.log(`${colors.dim}Listing ID: ${CLI_LISTING.listingId}${colors.reset}\n`);
  
  // Step 1: Initialize Browser
  printStep(1, "Initializing automated browser", 'info');
  console.log(`${colors.dim}  Launching headless Chrome browser...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 2000));
  console.log(`${colors.dim}  Configuring browser settings...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 1500));
  printStep(1, "Browser initialized successfully", 'success');
  
  // Step 2: Navigate to Booking Page
  printStep(2, "Navigating to booking page", 'info');
  console.log(`${colors.dim}  URL: ${CLI_LISTING.bookingUrl}${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 2500));
  console.log(`${colors.dim}  Waiting for page to load...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 2000));
  printStep(2, "Booking page loaded", 'success');
  
  // Step 3: Fill Profile Information (Step 1 of booking form)
  printStep(3, "Filling profile information (Step 1)", 'info');
  console.log(`${colors.dim}  Entering name: ${DEMO_USER_PROFILE.name}${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 800));
  console.log(`${colors.dim}  Entering email: ${DEMO_USER_PROFILE.email}${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 800));
  console.log(`${colors.dim}  Selecting showing type: ${DEMO_USER_PROFILE.showing_type}${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  printStep(3, "Profile information filled", 'success');
  
  // Step 4: Analyze Property and Available Dates (Step 2 of booking form)
  printStep(4, "Analyzing property and available dates (Step 2)", 'info');
  console.log(`${colors.dim}  Loading property details...${colors.reset}`);
  console.log(`${colors.bright}${colors.white}  Property: ${DEMO_PROPERTY.address}${colors.reset}`);
  console.log(`${colors.dim}  Listing ID: ${DEMO_PROPERTY.listingId}${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 1500));
  console.log(`${colors.dim}  Loading calendar data for today...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const today = new Date(2025, 10, 18);
  const todayFormatted = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  
  console.log(`${colors.dim}  Today's date: ${colors.bright}${todayFormatted}${colors.reset}`);
  console.log(`${colors.dim}  Found available time slots for today${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  printStep(4, "Property and calendar analysis complete", 'success');
  
  // Step 5: Select Time Slots for Booking (Step 3 of booking form)
  printStep(5, "Selecting time slots for booking (Step 3)", 'info');
  console.log(`${colors.dim}  Evaluating time slot preferences...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const bookings = [
    {
      day: todayFormatted,
      slot: { time: "2:00 PM", duration: "30 min", autoConfirm: false }
    },
    {
      day: todayFormatted,
      slot: { time: "4:00 PM", duration: "45 min", autoConfirm: true }
    }
  ];
  
  console.log(`\n${colors.bright}${colors.cyan}Booked Dates:${colors.reset}`);
  bookings.forEach((booking, index) => {
    console.log(`${colors.green}  ✓ ${booking.day} - ${booking.slot.time} (${booking.slot.duration})${colors.reset}`);
    if (booking.slot.autoConfirm) {
      console.log(`${colors.green}    ⚡ AUTO-CONFIRM${colors.reset}`);
    } else {
      console.log(`${colors.yellow}    ⏳ PENDING CONFIRMATION${colors.reset}`);
    }
  });
  
  console.log(`${colors.dim}\n  Booking property: ${DEMO_PROPERTY.address}${colors.reset}`);
  console.log(`${colors.dim}  Total bookings to create: ${bookings.length}${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 1200));
  printStep(5, "Time slots selected", 'success');
  
  // Step 6: Confirm Bookings
  printStep(6, "Confirming bookings", 'info');
  
  for (let i = 0; i < bookings.length; i++) {
    const booking = bookings[i];
    console.log(`${colors.bright}\n  📝 Booking ${i + 1} of ${bookings.length}:${colors.reset}`);
    console.log(`${colors.dim}     Property: ${DEMO_PROPERTY.address}${colors.reset}`);
    console.log(`${colors.dim}     Date: ${booking.day}${colors.reset}`);
    console.log(`${colors.dim}     Time: ${booking.slot.time}${colors.reset}`);
    console.log(`${colors.dim}     Duration: ${booking.slot.duration}${colors.reset}`);
    console.log(`${colors.dim}     Clicking 'Book Showing' button...${colors.reset}`);
    await new Promise(resolve => setTimeout(resolve, 1500));
    console.log(`${colors.dim}     Waiting for confirmation...${colors.reset}`);
    await new Promise(resolve => setTimeout(resolve, 1800));
    
    if (booking.slot.autoConfirm) {
      console.log(`${colors.green}     ⚡ Booking auto-confirmed!${colors.reset}`);
    } else {
      console.log(`${colors.yellow}     ⏳ Booking submitted - pending confirmation${colors.reset}`);
    }
  }
  
  printStep(6, "All bookings confirmed successfully", 'success');
  
  // Step 7: Save to Database
  printStep(7, "Saving bookings to database", 'info');
  
  let successCount = 0;
  for (let i = 0; i < bookings.length; i++) {
    const booking = bookings[i];
    console.log(`${colors.dim}  Saving booking ${i + 1}: ${booking.slot.time} (${booking.slot.duration})${colors.reset}`);
    
    const bookingData = {
      listing_id: CLI_LISTING.listingId,
      booking_date: booking.day,
      booking_time: booking.slot.time,
      duration: booking.slot.duration,
      user_name: DEMO_USER_PROFILE.name,
      user_email: DEMO_USER_PROFILE.email,
      organization: DEMO_USER_PROFILE.organization,
      showing_type: DEMO_USER_PROFILE.showing_type,
      status: booking.slot.autoConfirm ? "Confirmed" : "Pending",
      auto_confirmed: booking.slot.autoConfirm,
      booking_url: CLI_LISTING.bookingUrl
    };
    
    const saveSuccess = insertBooking(bookingData);
    if (saveSuccess) {
      successCount++;
      console.log(`${colors.green}    ✓ Saved successfully${colors.reset}`);
    } else {
      console.log(`${colors.red}    ✗ Failed to save${colors.reset}`);
    }
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  
  if (successCount === bookings.length) {
    printStep(7, `All ${bookings.length} bookings saved to database`, 'success');
  } else {
    printStep(7, `${successCount} of ${bookings.length} bookings saved`, 'warning');
  }
  
  // Step 8: Cleanup
  printStep(8, "Cleaning up browser session", 'info');
  console.log(`${colors.dim}  Closing browser...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  printStep(8, "Cleanup complete", 'success');
  
  // Display Results
  printHeader("📋 BOOKING CONFIRMATION", 'bgGreen');
  
  const confirmationInfo = {
    "Property": DEMO_PROPERTY.address,
    "Listing ID": CLI_LISTING.listingId,
    "Booking Window": todayFormatted,
    "User": DEMO_USER_PROFILE.name,
    "Email": DEMO_USER_PROFILE.email,
    "Showing Type": DEMO_USER_PROFILE.showing_type,
    "Organization": DEMO_USER_PROFILE.organization
  };
  
  printTable(confirmationInfo, "🏠 Property & Client");
  
  bookings.forEach((booking, index) => {
    const bookingInfo = {
      "Slot": `#${index + 1}`,
      "Date": booking.day,
      "Time": booking.slot.time,
      "Duration": booking.slot.duration,
      "Status": booking.slot.autoConfirm ? "✅ Auto-Confirmed" : "⏳ Pending Review"
    };
    
    printTable(bookingInfo, `🕒 Booking Slot ${index + 1}`);
  });
  
  // Display All Bookings Summary
  printHeader("💾 DATABASE SUMMARY", 'bgYellow');
  const allBookings = getAllBookings();
  const latestBooking = bookings[bookings.length - 1];
  console.log(`${colors.bright}Total bookings in database: ${colors.green}${allBookings.length}${colors.reset}`);
  console.log(`${colors.bright}Latest simulated booking: ${colors.cyan}${latestBooking.day} at ${latestBooking.slot.time}${colors.reset}`);
  console.log(`${colors.bright}Database location: ${colors.dim}src/data/data.db${colors.reset}`);
  
  // Next Steps
  printHeader("🎯 NEXT STEPS", 'bgMagenta');
  console.log(`${colors.bright}${colors.white}1. Check your email for booking confirmations${colors.reset}`);
  console.log(`${colors.dim}   Notifications will be sent to ${DEMO_USER_PROFILE.email}${colors.reset}`);
  console.log(`${colors.bright}${colors.white}2. Add both slots to your calendar${colors.reset}`);
  bookings.forEach((booking, index) => {
    console.log(`${colors.dim}   Slot ${index + 1}: ${booking.day} at ${booking.slot.time} (${booking.slot.duration})${colors.reset}`);
  });
  console.log(`${colors.bright}${colors.white}3. Prepare for the showing${colors.reset}`);
  console.log(`${colors.dim}   Review property details for ${DEMO_PROPERTY.address}${colors.reset}`);
  
  // Demo Complete
  printHeader("🎉 AUTO-BOOKING COMPLETE", 'bgGreen');
  console.log(`${colors.bright}${colors.white}The showing has been booked successfully!${colors.reset}`);
  console.log(`${colors.dim}Use the actual 'auto-book.js' script for real bookings.${colors.reset}\n`);
}

// Run the demo
runDemo().catch(console.error);

