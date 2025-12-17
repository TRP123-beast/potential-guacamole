#!/usr/bin/env node

/**
 * Database Initialization Script
 * Creates all required tables if they don't exist
 */

import Database from 'better-sqlite3';

const db = new Database('/app/src/data/data.db');

try {
  console.log('📦 Initializing database tables...');
  
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

    CREATE TABLE IF NOT EXISTS processed_showing_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      property_id TEXT NOT NULL,
      status TEXT,
      group_name TEXT,
      scheduled_date TEXT,
      scheduled_time TEXT,
      created_at TEXT,
      processed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

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

  console.log('✅ Database initialized successfully');
  db.close();
  process.exit(0);
} catch (error) {
  console.error('❌ Database initialization failed:', error.message);
  db.close();
  process.exit(1);
}

