#!/usr/bin/env node

import Database from "better-sqlite3";

const db = new Database("src/data/data.db");

function dumpTable(name) {
  try {
    const rows = db.prepare(`SELECT * FROM ${name}`).all();
    console.log(`\n=== ${name} (${rows.length}) ===`);
    rows.forEach((row, index) => {
      console.log(index + 1, row);
    });
  } catch (err) {
    console.error(`Error reading ${name}:`, err.message);
  }
}

dumpTable("processed_showing_requests");
dumpTable("properties");

db.close();


