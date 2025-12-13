#!/usr/bin/env node

import Database from "better-sqlite3";
import axios from "axios";

const db = new Database("src/data/data.db");
let debugPayloadLogs = 0;

function ensurePropertiesTable() {
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
}

function getPendingPropertyIds(limit = 50) {
  const rows = db
    .prepare(
      `
      SELECT DISTINCT psr.property_id
      FROM processed_showing_requests psr
      LEFT JOIN properties p ON p.property_id = psr.property_id
      WHERE p.property_id IS NULL OR p.address IS NULL OR p.address = ''
      ORDER BY psr.created_at
      LIMIT ?
    `
    )
    .all(limit);

  return rows.map((r) => r.property_id);
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
  // Top-level address field
  if (typeof payload.address === "string") return payload.address;
  if (payload.address && typeof payload.address === "object") {
    const addr = payload.address;
    if (typeof addr.unparsedAddress === "string") {
      return addr.unparsedAddress;
    }
    if (typeof addr.street === "string") {
      const parts = [
        addr.street,
        addr.city,
        addr.state,
        addr.postalCode,
      ].filter(Boolean);
      if (parts.length) {
        return parts.join(", ");
      }
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

async function fetchAddressForPropertyId(propertyId) {
  const url = `https://property-api-6nkd.onrender.com/api/properties/${encodeURIComponent(
    propertyId
  )}`;
  const res = await axios.get(url, { timeout: 15000 });
  const payload = res.data;
  const rawAddress = extractAddress(payload);

  if (!rawAddress) {
    if (debugPayloadLogs < 3) {
      console.error(
        "Unexpected payload shape for",
        propertyId,
        JSON.stringify(payload, null, 2)
      );
      debugPayloadLogs += 1;
    }
    throw new Error("No address field in payload");
  }

  const searchAddress = normalizeAddressForSearch(rawAddress);

  return {
    property_id: propertyId,
    address: searchAddress || rawAddress,
  };
}

async function hydrateAddresses() {
  ensurePropertiesTable();

  const pendingIds = getPendingPropertyIds();

  if (!pendingIds.length) {
    console.log("No pending property_ids without addresses.");
    return;
  }

  console.log(`Resolving addresses for ${pendingIds.length} property_ids...`);

  const upsertStmt = db.prepare(`
    INSERT INTO properties (property_id, address)
    VALUES (@property_id, @address)
    ON CONFLICT(property_id) DO UPDATE SET
      address = excluded.address
  `);

  const upsertMany = db.transaction((rows) => {
    for (const row of rows) {
      upsertStmt.run(row);
    }
  });

  const resolved = [];

  for (const propertyId of pendingIds) {
    try {
      const row = await fetchAddressForPropertyId(propertyId);
      resolved.push(row);
      console.log(`OK ${propertyId} -> ${row.address}`);
    } catch (err) {
      console.error(
        `Failed ${propertyId}:`,
        err.response?.status,
        err.message || err
      );
    }
  }

  if (resolved.length) {
    upsertMany(resolved);
    console.log(`Saved ${resolved.length} addresses into properties table.`);
  }
}

async function main() {
  try {
    await hydrateAddresses();
  } finally {
    db.close();
  }
}

main();


