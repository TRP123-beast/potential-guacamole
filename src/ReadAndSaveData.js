import Database from "better-sqlite3";
import { sendPropertyToAnalysis, sendPriceChangeToAnalysis } from "./utils.js";

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
  
  CREATE TABLE IF NOT EXISTS price_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id TEXT,
    old_price INTEGER,
    new_price INTEGER,
    change_amount INTEGER,
    change_percentage REAL,
    timestamp TEXT,
    FOREIGN KEY(property_id) REFERENCES properties(property_id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id TEXT,
    notification_type TEXT,
    content TEXT,
    timestamp TEXT,
    UNIQUE(property_id, notification_type, timestamp)
  );

  CREATE TABLE IF NOT EXISTS showing_appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id TEXT,
    appointment_id TEXT UNIQUE,
    property_address TEXT,
    agent_name TEXT,
    agent_company TEXT,
    agent_address TEXT,
    agent_email TEXT,
    showing_type TEXT,
    selected_date TEXT,
    selected_time TEXT,
    timezone TEXT,
    status TEXT,
    notes TEXT,
    buyers_invited TEXT,
    appointment_url TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY(property_id) REFERENCES properties(property_id)
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

//Setters
export function createProperty(propertyData) {
  const db = setupDatabase();
  try {
    const insertStmt = db.prepare(`
    INSERT INTO properties (property_id, address, price, price_change, status, bedrooms, bathrooms, sqft, listing_date, last_updated, mls_number, agent, agent_phone, description, features, details_json, rooms_json, url, property_type, year_built, lot_size, parking_spaces, organization, organization_address)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

    try {
      insertStmt.run(
        propertyData.property_id,
        propertyData.address,
        propertyData.price,
        propertyData.price_change || 0,
        propertyData.status,
        propertyData.bedrooms,
        propertyData.bathrooms,
        propertyData.sqft,
        propertyData.listing_date,
        propertyData.last_updated,
        propertyData.mls_number,
        propertyData.agent,
        propertyData.agent_phone,
        propertyData.description,
        propertyData.features,
        JSON.stringify(propertyData.details_json || {}),
        JSON.stringify(propertyData.rooms_json || []),
        propertyData.url,
        propertyData.property_type,
        propertyData.year_built,
        propertyData.lot_size,
        propertyData.parking_spaces,
        propertyData.organization,
        propertyData.organization_address
      );
      sendPropertyToAnalysis(propertyData);
      console.log(`Property ${propertyData.property_id} saved successfully`);
      } catch (error) {
        console.log("Duplicate protection: " + error.code);
    }
  } catch (error) {
    console.warn("An error occurred at insertProperty: " + error);
  } finally {
    db.close();
    return propertyData;
  }
}

export function createPriceChange(priceChangeData) {
  const db = setupDatabase();
  try {
    const insertStmt = db.prepare(`
    INSERT INTO price_changes (property_id, old_price, new_price, change_amount, change_percentage, timestamp)
    VALUES (?,?,?,?,?,?)
  `);
    try {
      insertStmt.run(
        priceChangeData.property_id,
        priceChangeData.old_price,
        priceChangeData.new_price,
        priceChangeData.change_amount,
        priceChangeData.change_percentage,
        priceChangeData.timestamp
      );
      console.log(`Price change recorded for property ${priceChangeData.property_id}`);
    } catch (error) {
      console.log(`Error recording price change: ${error}`);
    }
  } catch (error) {
    console.warn("An error occurred at insertPriceChange: " + error);
  } finally {
    db.close();
    return priceChangeData;
  }
}

export function createNotification(notificationData) {
  const db = setupDatabase();
  try {
    const insertStmt = db.prepare(`
    INSERT INTO notifications (property_id, notification_type, content, timestamp)
    VALUES (?,?,?,?)
  `);
    try {
      insertStmt.run(
        notificationData.property_id,
        notificationData.notification_type,
        notificationData.content,
        notificationData.timestamp || Date.now()
      );
      console.log(`Notification created for property ${notificationData.property_id}`);
    } catch (error) {
      console.log("Notification duplicate protection: " + error.code);
    }
  } catch (error) {
    console.warn("An error occurred at insertNotification: " + error);
  } finally {
    db.close();
    return notificationData;
  }
}

//Getters
export function getAllProperties() {
  const db = setupDatabase();
  try {
    const query = "SELECT * FROM properties ORDER BY last_updated DESC";
    const result = db.prepare(query).all();
    return result;
  } catch (error) {
    console.warn("An error occurred: " + error);
    return null;
  } finally {
    db.close();
  }
}

export function getProperty(property_id) {
  console.log("Property id: " + property_id);
  const db = setupDatabase();
  try {
    const query = "SELECT * FROM properties WHERE property_id = ? LIMIT 1";
    const result = db.prepare(query).get(property_id);
    console.log("Property: " + JSON.stringify(result));
    return result;
  } catch (error) {
    console.warn("An error occurred: " + error);
    return null;
  } finally {
    db.close();
  }
}

export function getPropertiesByAddress(address) {
  const db = setupDatabase();
  try {
    const query = "SELECT * FROM properties WHERE address LIKE ? ORDER BY last_updated DESC";
    const result = db.prepare(query).all(`%${address}%`);
    return result;
  } catch (error) {
    console.warn("An error occurred: " + error);
    return null;
  } finally {
    db.close();
  }
}

export function getPriceChanges(property_id) {
  const db = setupDatabase();
  try {
    const query = "SELECT * FROM price_changes WHERE property_id = ? ORDER BY timestamp DESC";
    const result = db.prepare(query).all(property_id);
    return result;
  } catch (error) {
    console.warn("An error occurred: " + error);
    return null;
  } finally {
    db.close();
  }
}

export function getAllNotifications() {
  const db = setupDatabase();
  try {
    const query = "SELECT * FROM notifications ORDER BY timestamp DESC";
    const result = db.prepare(query).all();
    return result;
  } catch (error) {
    console.warn("An error occurred: " + error);
    return null;
  } finally {
    db.close();
  }
}

//Checkers
export function hasProperty(property_id) {
  const db = setupDatabase();
  try {
    const query = "SELECT 1 FROM properties WHERE property_id = ? LIMIT 1";
    const result = db.prepare(query).get(property_id);
    return !!result;
  } catch (error) {
    console.warn("An error occurred: " + error);
    return false;
  } finally {
    db.close();
  }
}

export function hasPriceChange(property_id, timestamp) {
  const db = setupDatabase();
  try {
    const query = "SELECT 1 FROM price_changes WHERE property_id = ? AND timestamp = ? LIMIT 1";
    const result = db.prepare(query).get(property_id, timestamp);
    return !!result;
  } catch (error) {
    console.warn("An error occurred: " + error);
    return false;
  } finally {
    db.close();
  }
}

export function hasNotification(property_id, notification_type, timestamp) {
  const db = setupDatabase();
  try {
    const query = "SELECT 1 FROM notifications WHERE property_id = ? AND notification_type = ? AND timestamp = ? LIMIT 1";
    const result = db.prepare(query).get(property_id, notification_type, timestamp);
    return !!result;
  } catch (error) {
    console.warn("An error occurred: " + error);
    return false;
  } finally {
    db.close();
  }
}

export function updateProperty(propertyData) {
  const db = setupDatabase();
  try {
    const updateStmt = db.prepare(`
    UPDATE properties SET 
      price = ?, price_change = ?, status = ?, last_updated = ?, 
      description = ?, features = ?
    WHERE property_id = ?
  `);
    
    updateStmt.run(
      propertyData.price,
      propertyData.price_change || 0,
      propertyData.status,
      propertyData.last_updated,
      propertyData.description,
      propertyData.features,
      propertyData.property_id
    );
    
    console.log(`Property ${propertyData.property_id} updated successfully`);
  } catch (error) {
    console.log("An error occurred updating property: " + error);
  } finally {
    db.close();
  }
}

// Showing Appointment Functions
export function createShowingAppointment(appointmentData) {
  const db = setupDatabase();
  try {
    const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO showing_appointments (
      property_id, appointment_id, property_address, agent_name, agent_company,
      agent_address, agent_email, showing_type, selected_date, selected_time,
      timezone, status, notes, buyers_invited, appointment_url, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

    try {
      insertStmt.run(
        appointmentData.property_id,
        appointmentData.appointment_id,
        appointmentData.property_address,
        appointmentData.agent_name,
        appointmentData.agent_company,
        appointmentData.agent_address,
        appointmentData.agent_email,
        appointmentData.showing_type,
        appointmentData.selected_date,
        appointmentData.selected_time,
        appointmentData.timezone,
        appointmentData.status,
        appointmentData.notes,
        appointmentData.buyers_invited,
        appointmentData.appointment_url,
        appointmentData.created_at,
        appointmentData.updated_at
      );
      console.log(`Showing appointment ${appointmentData.appointment_id} saved successfully`);
    } catch (error) {
      console.log("Duplicate protection: " + error.code);
    }
  } catch (error) {
    console.warn("An error occurred at insertShowingAppointment: " + error);
  } finally {
    db.close();
    return appointmentData;
  }
}

export function getShowingAppointments(property_id) {
  const db = setupDatabase();
  try {
    const query = "SELECT * FROM showing_appointments WHERE property_id = ? ORDER BY created_at DESC";
    const result = db.prepare(query).all(property_id);
    return result;
  } catch (error) {
    console.warn("An error occurred: " + error);
    return null;
  } finally {
    db.close();
  }
}

export function getAllShowingAppointments() {
  const db = setupDatabase();
  try {
    const query = "SELECT * FROM showing_appointments ORDER BY created_at DESC";
    const result = db.prepare(query).all();
    return result;
  } catch (error) {
    console.warn("An error occurred: " + error);
    return null;
  } finally {
    db.close();
  }
}

// Showing Schedule Functions
export function createShowingSchedule(scheduleData) {
  const db = setupDatabase();
  try {
    const insertStmt = db.prepare(`
      INSERT INTO showing_schedules (
        property_id, date, time, duration, status, organization, organization_address, timezone
      ) VALUES (?,?,?,?,?,?,?,?)
    `);

    try {
      insertStmt.run(
        scheduleData.property_id,
        scheduleData.date,
        scheduleData.time,
        scheduleData.duration,
        scheduleData.status,
        scheduleData.organization,
        scheduleData.organization_address,
        scheduleData.timezone
      );
      console.log(`Showing schedule saved for property ${scheduleData.property_id}`);
    } catch (error) {
      console.log("Error saving showing schedule: " + error);
    }
  } catch (error) {
    console.warn("An error occurred at insertShowingSchedule: " + error);
  } finally {
    db.close();
    return scheduleData;
  }
}

export function getShowingSchedules(property_id) {
  const db = setupDatabase();
  try {
    const query = "SELECT * FROM showing_schedules WHERE property_id = ? ORDER BY date, time";
    const result = db.prepare(query).all(property_id);
    return result;
  } catch (error) {
    console.warn("An error occurred: " + error);
    return null;
  } finally {
    db.close();
  }
}

export function getAllShowingSchedules() {
  const db = setupDatabase();
  try {
    const query = "SELECT * FROM showing_schedules ORDER BY date, time";
    const result = db.prepare(query).all();
    return result;
  } catch (error) {
    console.warn("An error occurred: " + error);
    return null;
  } finally {
    db.close();
  }
}