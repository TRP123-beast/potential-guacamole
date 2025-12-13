#!/usr/bin/env node
import Database from "better-sqlite3";

const db = new Database("src/data/data.db");

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
  .all();

console.log("Tables:");
tables.forEach((t) => console.log("-", t.name));

for (const t of tables) {
  console.log("\nTable:", t.name);
  const cols = db
    .prepare(`PRAGMA table_info(${t.name})`)
    .all();
  cols.forEach((c) =>
    console.log(`  ${c.cid}: ${c.name} ${c.type} ${c.notnull ? "NOT NULL" : ""} ${c.pk ? "PRIMARY KEY" : ""}`)
  );
}

db.close();