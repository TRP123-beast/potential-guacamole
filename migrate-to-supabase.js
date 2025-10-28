#!/usr/bin/env node

import { configDotenv } from "dotenv";
import Database from "better-sqlite3";
import { createClient } from '@supabase/supabase-js';

configDotenv();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_PROJECT_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials!');
  console.error('Please add to your .env file:');
  console.error('SUPABASE_PROJECT_URL=your_supabase_url');
  console.error('SUPABASE_ANON_KEY=your_supabase_key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Local SQLite database
const localDb = new Database("src/data/data.db");

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function createSupabaseTable() {
  log('🔧 Creating showing_schedules table in Supabase...', 'cyan');
  
  // SQL to create the table in Supabase
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS showing_schedules (
      id BIGSERIAL PRIMARY KEY,
      property_id TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      duration TEXT NOT NULL,
      status TEXT NOT NULL,
      organization TEXT,
      organization_address TEXT,
      timezone TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql: createTableSQL });
    
    if (error) {
      // If rpc doesn't work, try direct SQL execution
      log('⚠️  RPC method failed, trying alternative approach...', 'yellow');
      
      // Create table using direct SQL (this might require different permissions)
      const { data: createData, error: createError } = await supabase
        .from('showing_schedules')
        .select('id')
        .limit(1);
        
      if (createError && createError.code === 'PGRST116') {
        log('❌ Table does not exist. Please create it manually in Supabase dashboard:', 'red');
        log('', 'reset');
        log('SQL to run in Supabase SQL Editor:', 'yellow');
        log(createTableSQL, 'cyan');
        log('', 'reset');
        return false;
      }
    }
    
    log('✅ Table created/verified successfully!', 'green');
    return true;
  } catch (error) {
    log(`❌ Error creating table: ${error.message}`, 'red');
    return false;
  }
}

async function migrateData() {
  log('📊 Starting data migration...', 'cyan');
  
  try {
    // Get all showing schedules from local database
    const schedules = localDb.prepare(`
      SELECT 
        property_id,
        date,
        time,
        duration,
        status,
        organization,
        organization_address,
        timezone,
        created_at
      FROM showing_schedules 
      ORDER BY created_at
    `).all();

    log(`📋 Found ${schedules.length} showing schedules to migrate`, 'blue');

    if (schedules.length === 0) {
      log('⚠️  No data to migrate!', 'yellow');
      return;
    }

    // Batch insert data (Supabase has limits on batch size)
    const batchSize = 100;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < schedules.length; i += batchSize) {
      const batch = schedules.slice(i, i + batchSize);
      
      log(`📤 Migrating batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(schedules.length/batchSize)} (${batch.length} records)...`, 'cyan');
      
      const { data, error } = await supabase
        .from('showing_schedules')
        .insert(batch);

      if (error) {
        log(`❌ Error in batch ${Math.floor(i/batchSize) + 1}: ${error.message}`, 'red');
        errorCount += batch.length;
        
        // Try inserting one by one to identify problematic records
        for (const record of batch) {
          const { error: singleError } = await supabase
            .from('showing_schedules')
            .insert(record);
            
          if (singleError) {
            log(`❌ Failed to insert: ${record.property_id} - ${record.date} ${record.time}`, 'red');
            errorCount++;
          } else {
            successCount++;
          }
        }
      } else {
        successCount += batch.length;
        log(`✅ Batch ${Math.floor(i/batchSize) + 1} migrated successfully!`, 'green');
      }
    }

    log('', 'reset');
    log('📊 Migration Summary:', 'bright');
    log(`✅ Successfully migrated: ${successCount} records`, 'green');
    if (errorCount > 0) {
      log(`❌ Failed to migrate: ${errorCount} records`, 'red');
    }
    
  } catch (error) {
    log(`❌ Migration failed: ${error.message}`, 'red');
  }
}

async function verifyMigration() {
  log('🔍 Verifying migration...', 'cyan');
  
  try {
    // Count records in Supabase
    const { count, error } = await supabase
      .from('showing_schedules')
      .select('*', { count: 'exact', head: true });

    if (error) {
      log(`❌ Error verifying migration: ${error.message}`, 'red');
      return;
    }

    // Count records in local database
    const localCount = localDb.prepare('SELECT COUNT(*) as count FROM showing_schedules').get().count;
    
    log(`📊 Local database: ${localCount} records`, 'blue');
    log(`📊 Supabase database: ${count} records`, 'blue');
    
    if (count === localCount) {
      log('✅ Migration verification successful!', 'green');
    } else {
      log('⚠️  Record count mismatch - some records may not have migrated', 'yellow');
    }

    // Show sample data from Supabase
    const { data: sampleData, error: sampleError } = await supabase
      .from('showing_schedules')
      .select('*')
      .limit(3);

    if (!sampleError && sampleData && sampleData.length > 0) {
      log('', 'reset');
      log('📋 Sample data in Supabase:', 'cyan');
      sampleData.forEach((record, index) => {
        log(`${index + 1}. ${record.property_id} - ${record.date} ${record.time} (${record.status})`, 'blue');
      });
    }

  } catch (error) {
    log(`❌ Verification failed: ${error.message}`, 'red');
  }
}

async function main() {
  log('🚀 Starting Supabase Migration', 'bright');
  log('================================', 'bright');
  
  // Check if local database exists
  try {
    const testQuery = localDb.prepare('SELECT COUNT(*) as count FROM showing_schedules').get();
    log(`📊 Local database contains ${testQuery.count} showing schedules`, 'blue');
  } catch (error) {
    log('❌ Local database not found or no showing_schedules table!', 'red');
    log('Please run the demo scraper first to generate data.', 'yellow');
    process.exit(1);
  }

  // Step 1: Create table in Supabase
  const tableCreated = await createSupabaseTable();
  if (!tableCreated) {
    log('❌ Cannot proceed without table creation', 'red');
    process.exit(1);
  }

  // Step 2: Migrate data
  await migrateData();

  // Step 3: Verify migration
  await verifyMigration();

  log('', 'reset');
  log('🎉 Migration process completed!', 'green');
  log('================================', 'bright');
  
  localDb.close();
}

// Handle errors
process.on('unhandledRejection', (error) => {
  log(`❌ Unhandled error: ${error.message}`, 'red');
  process.exit(1);
});

main().catch(console.error);
