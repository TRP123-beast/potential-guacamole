#!/usr/bin/env node

import { configDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import Database from "better-sqlite3";

configDotenv();

const supabaseUrl = process.env.SUPABASE_PROJECT_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase credentials.");
  console.error(
    "Set SUPABASE_PROJECT_URL and SUPABASE_ANON_KEY (and optionally SUPABASE_SERVICE_ROLE_KEY) in .env"
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const db = new Database("src/data/data.db");

function ensureLocalTable() {
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
      processed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function getAlreadyProcessedIds() {
  const rows = db.prepare("SELECT id FROM processed_showing_requests").all();
  return new Set(rows.map((r) => r.id));
}

async function fetchNewShowingRequests() {
  ensureLocalTable();

  const processedIds = getAlreadyProcessedIds();
  const pageSize = 500;
  let page = 0;
  const fresh = [];

  for (;;) {
    const { data, error } = await supabase
      .from("showing_requests")
      .select(
        "id, user_id, property_id, status, created_at, scheduled_date, scheduled_time, group_name"
      )
      .in("status", ["pending", "scheduled", "rescheduled"])
      .order("created_at", { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      if (!processedIds.has(row.id)) {
        fresh.push(row);
      }
    }

    if (data.length < pageSize) {
      break;
    }

    page += 1;
  }

  if (!fresh.length) {
    console.log("No new showing_requests to process.");
    return [];
  }

  const insertStmt = db.prepare(`
    INSERT INTO processed_showing_requests (
      id,
      user_id,
      property_id,
      status,
      group_name,
      scheduled_date,
      scheduled_time,
      created_at
    ) VALUES (
      @id,
      @user_id,
      @property_id,
      @status,
      @group_name,
      @scheduled_date,
      @scheduled_time,
      @created_at
    )
  `);

  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      insertStmt.run({
        id: row.id,
        user_id: row.user_id ?? null,
        property_id: row.property_id,
        status: row.status ?? null,
        group_name: row.group_name ?? null,
        scheduled_date: row.scheduled_date ?? null,
        scheduled_time: row.scheduled_time ?? null,
        created_at: row.created_at ?? null,
      });
    }
  });

  insertMany(fresh);

  console.log(`Stored ${fresh.length} new showing_requests locally.`);
  console.log(
    "Property IDs:",
    fresh.map((r) => r.property_id)
  );

  return fresh;
}

async function main() {
  try {
    await fetchNewShowingRequests();
  } catch (err) {
    console.error("Error fetching showing_requests:", err.message || err);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();


