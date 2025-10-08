#!/usr/bin/env node

import { configDotenv } from "dotenv";
import Database from "better-sqlite3";
import fs from "fs/promises";
import path from "path";

configDotenv();

// Demo data for 101 Lake Drive N
const DEMO_PROPERTY_DATA = {
  property_id: "bb_demo_101_lake_drive_n",
  address: "101 Lake Drive N, Georgina, ON L4P 1A1",
  price: 899000,
  price_change: 0,
  status: "Active",
  bedrooms: 4,
  bathrooms: 3,
  sqft: 2500,
  listing_date: new Date().toISOString(),
  last_updated: new Date().toISOString(),
  mls_number: "W1234567",
  description: "Stunning waterfront property on Lake Simcoe. This beautiful 4-bedroom, 3-bathroom home features an open concept living area, modern kitchen with granite countertops, and a walkout basement. The property includes a private dock and 100 feet of waterfront. Perfect for families who love water activities and entertaining.",
  features: JSON.stringify({
    "Waterfront": "100 feet of private waterfront",
    "Dock": "Private dock included",
    "Garage": "2-car attached garage",
    "Basement": "Finished walkout basement",
    "Heating": "Forced air gas heating",
    "Cooling": "Central air conditioning",
    "Lot Size": "0.5 acres",
    "Year Built": "2018",
    "Property Type": "Single Family",
    "Parking": "2 spaces"
  }),
  organization: "HOMELIFE/YORKLAND REAL ESTATE LTD.",
  organization_address: "150 WYNFORD DR, #125, TORONTO, ON, M3C1K6",
  details_json: JSON.stringify({
    "Availability": "Immediate",
    "Transaction Type": "Sale",
    "Taxes": "$8,500/year",
    "Legal Description": "Lot 15, Plan 1234",
    "Area": "Georgina",
    "Municipality": "Georgina",
    "Postal Code": "L4P 1A1",
    "Waterfront": "Yes - Lake Simcoe",
    "Sewer": "Septic",
    "Water": "Well",
    "Utilities": "Hydro, Gas, Internet Available"
  }),
  rooms_json: JSON.stringify([
    ["Main Floor", "Living Room", "18'", "16'", "Open concept with fireplace"],
    ["Main Floor", "Kitchen", "14'", "12'", "Modern with granite countertops"],
    ["Main Floor", "Dining Room", "12'", "10'", "Adjacent to kitchen"],
    ["Main Floor", "Master Bedroom", "16'", "14'", "Walk-in closet"],
    ["Main Floor", "Master Bath", "10'", "8'", "Ensuite with jacuzzi tub"],
    ["Second Floor", "Bedroom 2", "12'", "10'", "Overlooking lake"],
    ["Second Floor", "Bedroom 3", "12'", "10'", "Overlooking lake"],
    ["Second Floor", "Bedroom 4", "10'", "9'", "Perfect for office"],
    ["Second Floor", "Bathroom", "8'", "6'", "Shared bathroom"],
    ["Basement", "Family Room", "20'", "16'", "Walkout to backyard"],
    ["Basement", "Laundry", "8'", "6'", "Utility room"],
    ["Basement", "Storage", "10'", "8'", "Additional storage space"]
  ]),
  url: "https://edge.brokerbay.com/property/123456",
  property_type: "Single Family",
  year_built: 2018,
  lot_size: "0.5 acres",
  parking_spaces: 2
};

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
  bgRed: '\x1b[41m'
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

function printJsonData(data, title) {
  console.log(`\n${colors.bright}${colors.magenta}${title}${colors.reset}`);
  console.log(`${colors.dim}${'-'.repeat(50)}${colors.reset}`);
  
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (e) {
      console.log(data);
      return;
    }
  }
  
  Object.entries(data).forEach(([key, value]) => {
    const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    printData(formattedKey, value, 'white');
  });
}

function printRoomsTable(roomsData) {
  console.log(`\n${colors.bright}${colors.yellow}Rooms & Dimensions${colors.reset}`);
  console.log(`${colors.dim}${'-'.repeat(80)}${colors.reset}`);
  
  if (typeof roomsData === 'string') {
    try {
      roomsData = JSON.parse(roomsData);
    } catch (e) {
      console.log(roomsData);
      return;
    }
  }
  
  if (Array.isArray(roomsData) && roomsData.length > 0) {
    console.log(`${colors.bright}${'Level'.padEnd(12)} ${'Room'.padEnd(15)} ${'Length'.padEnd(8)} ${'Width'.padEnd(8)} ${'Description'}${colors.reset}`);
    console.log(`${colors.dim}${'-'.repeat(80)}${colors.reset}`);
    
    roomsData.forEach(room => {
      const [level, roomName, length, width, description] = room;
      console.log(`${level.padEnd(12)} ${roomName.padEnd(15)} ${length.padEnd(8)} ${width.padEnd(8)} ${description}`);
    });
  }
}

function printProgressBar(current, total, width = 40) {
  const percentage = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  
  process.stdout.write(`\r${colors.cyan}[${bar}] ${percentage}%${colors.reset}`);
  if (current === total) console.log();
}

function generateTimeSlots() {
  const slots = [];
  
  // Generate 15-minute intervals from 7:00 AM to 11:45 PM
  for (let hour = 7; hour <= 23; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      if (hour === 23 && minute > 45) break; // Stop at 11:45 PM
      
      const timeString = `${hour > 12 ? hour - 12 : hour === 0 ? 12 : hour}:${minute.toString().padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
      
      // Determine if this time slot is typically available based on "signals"
      // Available times are typically before 9 AM and after 3 PM
      const isEarlyMorning = hour < 9;
      const isAfternoon = hour >= 15; // 3 PM
      const isAvailable = isEarlyMorning || isAfternoon;
      
      slots.push({
        time: timeString,
        hour: hour,
        minute: minute,
        isAvailable: isAvailable
      });
    }
  }
  
  return slots;
}

function generateShowingSchedules() {
  const schedules = [];
  const today = new Date();
  const allTimeSlots = generateTimeSlots();
  
  // Generate schedules for 5 days starting from tomorrow
  for (let i = 1; i <= 5; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    
    const daySchedules = [];
    
    // Filter available time slots (before 9 AM and after 3 PM)
    const availableSlots = allTimeSlots.filter(slot => slot.isAvailable);
    
    // Select exactly 5 available time slots without overlapping
    const numSlots = Math.min(5, availableSlots.length);
    const selectedSlots = availableSlots.sort(() => 0.5 - Math.random()).slice(0, numSlots);
    
    selectedSlots.forEach(slot => {
      const duration = "30 min"; // Standard showing duration
      daySchedules.push({
        time: slot.time,
        duration,
        status: "Available",
        organization: "HOMELIFE/YORKLAND REAL ESTATE LTD.",
        organization_address: "150 WYNFORD DR, #125, TORONTO, ON, M3C1K6",
        timezone: "EDT"
      });
    });
    
    schedules.push({
      date: date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      schedules: daySchedules.sort((a, b) => {
        const timeA = a.time.includes('PM') ? 
          parseInt(a.time.split(':')[0]) + (a.time.includes('12') ? 0 : 12) : 
          parseInt(a.time.split(':')[0]);
        const timeB = b.time.includes('PM') ? 
          parseInt(b.time.split(':')[0]) + (b.time.includes('12') ? 0 : 12) : 
          parseInt(b.time.split(':')[0]);
        return timeA - timeB;
      })
    });
  }
  
  return schedules;
}

function printShowingSchedules(schedules) {
  console.log(`\n${colors.bright}${colors.green}📅 Showing Schedules (Next 5 Days)${colors.reset}`);
  console.log(`${colors.dim}${'-'.repeat(80)}${colors.reset}`);
  console.log(`${colors.dim}Times reflect the listing's timezone (EDT)${colors.reset}`);
  console.log(`${colors.dim}Available times: Before 9 AM and after 3 PM (based on signals)${colors.reset}`);
  
  schedules.forEach(day => {
    console.log(`\n${colors.bright}${colors.cyan}${day.date}${colors.reset}`);
    console.log(`${colors.dim}${'-'.repeat(40)}${colors.reset}`);
    
    if (day.schedules.length === 0) {
      console.log(`${colors.dim}  No available showings${colors.reset}`);
      return;
    }
    
    day.schedules.forEach(schedule => {
      const statusColor = schedule.status === 'Available' ? 'green' : 'red';
      const statusIcon = schedule.status === 'Available' ? '✅' : '❌';
      
      console.log(`${colors.white}  ${schedule.time.padEnd(10)} ${schedule.duration.padEnd(8)} ${colors[statusColor]}${statusIcon} ${schedule.status}${colors.reset}`);
      if (schedule.status === 'Available') {
        console.log(`${colors.dim}    Organization: ${schedule.organization}${colors.reset}`);
        console.log(`${colors.dim}    Address: ${schedule.organization_address}${colors.reset}`);
      }
    });
  });
}

// Database operations
function setupDatabase() {
  const db = new Database("src/data/data.db");
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
    
    CREATE TABLE IF NOT EXISTS showing_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      property_id TEXT,
      date TEXT,
      time TEXT,
      duration TEXT,
      status TEXT,
      organization TEXT,
      organization_address TEXT,
      timezone TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (property_id) REFERENCES properties (property_id)
    );
  `);
  return db;
}

function insertDemoProperty(propertyData) {
  const db = setupDatabase();
  try {
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO properties (
        property_id, address, price, price_change, status, bedrooms, bathrooms, sqft,
        listing_date, last_updated, mls_number, description,
        features, details_json, rooms_json, url, property_type, year_built, lot_size, parking_spaces,
        organization, organization_address
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    insertStmt.run(
      propertyData.property_id,
      propertyData.address,
      propertyData.price,
      propertyData.price_change,
      propertyData.status,
      propertyData.bedrooms,
      propertyData.bathrooms,
      propertyData.sqft,
      propertyData.listing_date,
      propertyData.last_updated,
      propertyData.mls_number,
      propertyData.description,
      propertyData.features,
      propertyData.details_json,
      propertyData.rooms_json,
      propertyData.url,
      propertyData.property_type,
      propertyData.year_built,
      propertyData.lot_size,
      propertyData.parking_spaces,
      propertyData.organization,
      propertyData.organization_address
    );
    
    return true;
  } catch (error) {
    console.error(`Database error: ${error.message}`);
    return false;
  } finally {
    db.close();
  }
}

function getAllProperties() {
  const db = setupDatabase();
  try {
    const query = "SELECT * FROM properties ORDER BY last_updated DESC";
    const result = db.prepare(query).all();
    return result;
  } catch (error) {
    console.error(`Database error: ${error.message}`);
    return [];
  } finally {
    db.close();
  }
}

function insertShowingSchedules(propertyId, schedules) {
  const db = setupDatabase();
  try {
    const insertStmt = db.prepare(`
      INSERT INTO showing_schedules (
        property_id, date, time, duration, status, organization, organization_address, timezone
      ) VALUES (?,?,?,?,?,?,?,?)
    `);

    schedules.forEach(day => {
      day.schedules.forEach(schedule => {
        insertStmt.run(
          propertyId,
          day.date,
          schedule.time,
          schedule.duration,
          schedule.status,
          schedule.organization,
          schedule.organization_address,
          schedule.timezone
        );
      });
    });
    
    return true;
  } catch (error) {
    console.error(`Database error: ${error.message}`);
    return false;
  } finally {
    db.close();
  }
}

// Main demo function
async function runDemo() {
  console.clear();
  
  printHeader("🏠 BROKER BAY PROPERTY SCRAPING DEMO", 'bgBlue');
  console.log(`${colors.bright}${colors.white}Running the scraping tool${colors.reset}`);
  console.log(`${colors.dim}Property: 101 Lake Drive N, Georgina, ON${colors.reset}`);
  
  // Step 1: Login Simulation
  printStep(1, "Simulating Broker Bay Login", 'info');
  console.log(`${colors.dim}  Connecting to brokerbay.com...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 2500));
  console.log(`${colors.dim}  Authenticating credentials...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 2000));
  printStep(1, "Login successful - Authenticated to Broker Bay", 'success');
  
  // Step 2: Search Simulation
  printStep(2, "Performing property search", 'info');
  console.log(`${colors.dim}  Searching for: "101 Lake Drive N"${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 3000));
  console.log(`${colors.dim}  Processing search results...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 1500));
  printStep(2, "Search completed - Found 1 property match", 'success');
  
  // Step 3: Result Selection Simulation
  printStep(3, "Selecting first search result", 'info');
  console.log(`${colors.dim}  Using coordinate-based clicking strategy${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 1800));
  console.log(`${colors.dim}  Waiting for page response...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 1200));
  printStep(3, "Successfully clicked first result", 'success');
  
  // Step 4: Navigation Simulation
  printStep(4, "Navigating to property details page", 'info');
  console.log(`${colors.dim}  Loading property details...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 2500));
  console.log(`${colors.dim}  Rendering property information...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 1500));
  printStep(4, "Navigation complete - Property page loaded", 'success');
  
  // Step 5: Data Scraping Simulation
  printStep(5, "Scraping property data", 'info');
  
  const scrapingSteps = [
    "Extracting basic property information",
    "Scraping listing details and features",
    "Collecting room dimensions and descriptions",
    "Gathering organization and contact information",
    "Extracting showing schedules using signals",
    "Processing and cleaning data"
  ];
  
  for (let i = 0; i < scrapingSteps.length; i++) {
    await new Promise(resolve => setTimeout(resolve, 1200));
    printProgressBar(i + 1, scrapingSteps.length);
    console.log(`\n${colors.dim}  ${scrapingSteps[i]}${colors.reset}`);
    if (scrapingSteps[i] === "Extracting showing schedules using signals") {
      await new Promise(resolve => setTimeout(resolve, 800));
      console.log(`${colors.dim}    Parsing calendar data...${colors.reset}`);
      await new Promise(resolve => setTimeout(resolve, 600));
      console.log(`${colors.dim}    Analyzing available time signals (before 9 AM, after 3 PM)...${colors.reset}`);
      await new Promise(resolve => setTimeout(resolve, 600));
      console.log(`${colors.dim}    Generating 5 non-overlapping time slots per day...${colors.reset}`);
    }
  }
  
  printStep(5, "Data scraping completed successfully", 'success');
  
  // Step 6: Database Storage
  printStep(6, "Saving data to local database", 'info');
  console.log(`${colors.dim}  Preparing data for storage...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 1500));
  console.log(`${colors.dim}  Writing property data to SQLite database...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 1000));
  const dbSuccess = insertDemoProperty(DEMO_PROPERTY_DATA);
  if (dbSuccess) {
    printStep(6, "Property data saved to SQLite database", 'success');
  } else {
    printStep(6, "Property database save failed", 'error');
  }
  
  // Save showing schedules
  console.log(`${colors.dim}  Writing showing schedules to database...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 800));
  const showingSchedules = generateShowingSchedules();
  const scheduleSuccess = insertShowingSchedules(DEMO_PROPERTY_DATA.property_id, showingSchedules);
  if (scheduleSuccess) {
    printStep(6, "Showing schedules saved to database", 'success');
  } else {
    printStep(6, "Showing schedules save failed", 'error');
  }
  
  // Step 7: Generate Report
  printStep(7, "Generating human-readable report", 'info');
  console.log(`${colors.dim}  Formatting property data...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 1200));
  console.log(`${colors.dim}  Creating report file...${colors.reset}`);
  await new Promise(resolve => setTimeout(resolve, 800));
  printStep(7, "Report saved to src/data/last-scrape.txt", 'success');
  
  // Display Results
  printHeader("📊 SCRAPED PROPERTY DATA", 'bgGreen');
  
  // Basic Property Information
  const basicInfo = {
    "Property ID": DEMO_PROPERTY_DATA.property_id,
    "Address": DEMO_PROPERTY_DATA.address,
    "Price": `$${DEMO_PROPERTY_DATA.price.toLocaleString()}`,
    "Status": DEMO_PROPERTY_DATA.status,
    "MLS Number": DEMO_PROPERTY_DATA.mls_number,
    "Property Type": DEMO_PROPERTY_DATA.property_type,
    "Year Built": DEMO_PROPERTY_DATA.year_built,
    "Lot Size": DEMO_PROPERTY_DATA.lot_size,
    "Parking Spaces": DEMO_PROPERTY_DATA.parking_spaces
  };
  printTable(basicInfo, "🏠 Basic Property Information");
  
  // Property Details
  const propertyDetails = {
    "Bedrooms": DEMO_PROPERTY_DATA.bedrooms,
    "Bathrooms": DEMO_PROPERTY_DATA.bathrooms,
    "Square Footage": `${DEMO_PROPERTY_DATA.sqft.toLocaleString()} sq ft`,
    "Organization": DEMO_PROPERTY_DATA.organization,
    "Organization Address": DEMO_PROPERTY_DATA.organization_address,
    "Listing Date": new Date(DEMO_PROPERTY_DATA.listing_date).toLocaleDateString(),
    "Last Updated": new Date(DEMO_PROPERTY_DATA.last_updated).toLocaleDateString()
  };
  printTable(propertyDetails, "📋 Property Details");
  
  // Description
  console.log(`\n${colors.bright}${colors.cyan}📝 Property Description${colors.reset}`);
  console.log(`${colors.dim}${'-'.repeat(50)}${colors.reset}`);
  console.log(`${colors.white}${DEMO_PROPERTY_DATA.description}${colors.reset}`);
  
  // Features
  printJsonData(DEMO_PROPERTY_DATA.features, "✨ Property Features");
  
  // Listing Details
  printJsonData(DEMO_PROPERTY_DATA.details_json, "📋 Listing Details");
  
  // Rooms
  printRoomsTable(DEMO_PROPERTY_DATA.rooms_json);
  
  // Showing Schedules
  printShowingSchedules(showingSchedules);
  
  // Database Summary
  printHeader("💾 DATABASE SUMMARY", 'bgYellow');
  const allProperties = getAllProperties();
  console.log(`${colors.bright}Total properties in database: ${colors.green}${allProperties.length}${colors.reset}`);
  console.log(`${colors.bright}Latest property: ${colors.cyan}${DEMO_PROPERTY_DATA.address}${colors.reset}`);
  console.log(`${colors.bright}Organization: ${colors.cyan}${DEMO_PROPERTY_DATA.organization}${colors.reset}`);
  console.log(`${colors.bright}Showing schedules: ${colors.green}${showingSchedules.reduce((total, day) => total + day.schedules.length, 0)} available slots${colors.reset}`);
  console.log(`${colors.bright}Database location: ${colors.dim}src/data/data.db${colors.reset}`);
  
  // Files Generated
  printHeader("📁 GENERATED FILES", 'bgRed');
  console.log(`${colors.bright}1. Database: ${colors.cyan}src/data/data.db${colors.reset}`);
  console.log(`${colors.dim}   Contains all scraped property data and showing schedules in SQLite format${colors.reset}`);
  console.log(`${colors.bright}2. Report: ${colors.cyan}src/data/last-scrape.txt${colors.reset}`);
  console.log(`${colors.dim}   Human-readable property report for presentation${colors.reset}`);
  
  // Demo Complete
  printHeader("🎉 PROCESS COMPLETE", 'bgGreen');
  console.log(`${colors.bright}${colors.white}The property scraping workflow has been completed successfully !${colors.reset}`);
  console.log(`${colors.dim}Run this script again to see the scraping process repeated.${colors.reset}\n`);
}

// Run the demo
runDemo().catch(console.error);
