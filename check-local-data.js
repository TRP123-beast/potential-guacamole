#!/usr/bin/env node

import Database from "better-sqlite3";

const db = new Database("src/data/data.db");

console.log('📊 Local Database Summary');
console.log('========================\n');

try {
  // Check properties
  const propertyCount = db.prepare('SELECT COUNT(*) as count FROM properties').get().count;
  console.log(`🏠 Properties: ${propertyCount}`);
  
  // Check showing schedules
  const scheduleCount = db.prepare('SELECT COUNT(*) as count FROM showing_schedules').get().count;
  console.log(`📅 Showing Schedules: ${scheduleCount}`);
  
  // Show property details
  const properties = db.prepare('SELECT address, organization FROM properties ORDER BY address').all();
  console.log('\n📋 Properties in database:');
  properties.forEach((prop, index) => {
    console.log(`${index + 1}. ${prop.address}`);
    console.log(`   Organization: ${prop.organization}`);
  });
  
  // Show schedule summary by property
  const scheduleSummary = db.prepare(`
    SELECT 
      p.address,
      COUNT(s.id) as schedule_count
    FROM properties p
    LEFT JOIN showing_schedules s ON p.property_id = s.property_id
    GROUP BY p.property_id, p.address
    ORDER BY p.address
  `).all();
  
  console.log('\n📅 Schedules per property:');
  scheduleSummary.forEach((summary, index) => {
    console.log(`${index + 1}. ${summary.address}: ${summary.schedule_count} schedules`);
  });
  
  // Show sample schedules
  const sampleSchedules = db.prepare(`
    SELECT 
      p.address,
      s.date,
      s.time,
      s.status
    FROM showing_schedules s
    JOIN properties p ON s.property_id = p.property_id
    ORDER BY s.created_at
    LIMIT 5
  `).all();
  
  console.log('\n📋 Sample schedules:');
  sampleSchedules.forEach((schedule, index) => {
    console.log(`${index + 1}. ${schedule.address}`);
    console.log(`   ${schedule.date} at ${schedule.time} (${schedule.status})`);
  });
  
} catch (error) {
  console.error('❌ Error reading database:', error.message);
} finally {
  db.close();
}

console.log('\n✅ Data check complete!');
console.log('\nTo migrate this data to Supabase:');
console.log('2. Run: node migrate-to-supabase.js');
