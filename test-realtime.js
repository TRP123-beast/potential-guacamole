#!/usr/bin/env node

import { configDotenv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

configDotenv();

const supabaseUrl = process.env.SUPABASE_PROJECT_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseKey = supabaseServiceKey || supabaseAnonKey;

console.log('\n╔═══════════════════════════════════════════════════════════╗');
console.log('║         Supabase Realtime Connection Test               ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase credentials in .env file");
  console.error("   Required: SUPABASE_PROJECT_URL and SUPABASE_SERVICE_ROLE_KEY (or ANON as fallback)\n");
  process.exit(1);
}

console.log(`📡 Supabase URL: ${supabaseUrl}`);
if (supabaseServiceKey) {
  console.log(`🔑 Using SERVICE ROLE key: ${supabaseKey.substring(0, 20)}...`);
} else {
  console.log(`⚠️ Using ANON key (set SUPABASE_SERVICE_ROLE_KEY for Realtime/RLS): ${supabaseKey.substring(0, 20)}...`);
}
console.log();

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('🔌 Attempting to subscribe to showing_requests table...\n');

const channel = supabase
  .channel('test_realtime_connection')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'showing_requests'
    },
    (payload) => {
      console.log('\n🎉 SUCCESS! Realtime event received:');
      console.log('═'.repeat(60));
      console.log(JSON.stringify(payload, null, 2));
      console.log('═'.repeat(60));
      console.log('\n✅ Realtime is working correctly!\n');
      console.log('You can now:');
      console.log('1. Stop this test (Ctrl+C)');
      console.log('2. Deploy to Railway with confidence');
      console.log('3. New records will be auto-booked\n');
    }
  )
  .subscribe((status, err) => {
    console.log(`📊 Subscription status: ${status}`);
    
    if (status === 'SUBSCRIBED') {
      console.log('✅ Successfully subscribed to Realtime!\n');
      console.log('📝 Now insert a test record in Supabase:');
      console.log('   Go to SQL Editor and run:');
      console.log('   ');
      console.log('   INSERT INTO showing_requests (property_id, status)');
      console.log("   VALUES ('test_realtime_check', 'pending');");
      console.log('   ');
      console.log('   You should see the event above within 1 second.\n');
      console.log('⏳ Waiting for events... (Press Ctrl+C to exit)\n');
    } else if (status === 'CHANNEL_ERROR') {
      console.error('\n❌ ERROR: Failed to subscribe to Realtime');
      if (err) {
        console.error(`   Details: ${err.message || JSON.stringify(err)}`);
      }
      console.error('\n🔧 Troubleshooting steps:');
      console.error('   1. Enable Realtime in Supabase Dashboard → Database → Replication');
      console.error('   2. Add table to publication:');
      console.error('      ALTER PUBLICATION supabase_realtime ADD TABLE showing_requests;');
      console.error('   3. Check RLS policies or disable temporarily:');
      console.error('      ALTER TABLE showing_requests DISABLE ROW LEVEL SECURITY;');
      console.error('   4. Verify credentials in .env file');
      console.error('\n📚 See SUPABASE_REALTIME_SETUP.md for detailed guide\n');
      process.exit(1);
    } else if (status === 'TIMED_OUT') {
      console.error('\n⏱️  Subscription timed out');
      console.error('   Check your internet connection and Supabase project status\n');
      process.exit(1);
    } else if (status === 'CLOSED') {
      console.log('\n🔌 Subscription closed\n');
      process.exit(0);
    }
  });

process.on('SIGINT', () => {
  console.log('\n\n👋 Unsubscribing and exiting...');
  channel.unsubscribe();
  process.exit(0);
});

