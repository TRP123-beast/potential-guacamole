#!/usr/bin/env node

/**
 * Automated Scheduler for Fetching Showing Requests and Property Addresses
 * 
 * This script runs continuously and executes:
 * 1. fetch-showing-requests.js - Fetches new showing requests from Supabase
 * 2. fetch-property-addresses.js - Resolves property IDs to addresses
 * 
 * Runs every 10-15 minutes with rate limiting
 */

import { spawn } from "child_process";
import { configDotenv } from "dotenv";

configDotenv();

// Configuration
const FETCH_INTERVAL_MS = parseInt(process.env.FETCH_INTERVAL_MINUTES || "12") * 60 * 1000; // Default: 12 minutes
const RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutes retry delay on error
const ENABLED = process.env.ENABLE_AUTO_FETCH !== "false"; // Default: enabled

// ANSI colors for logging
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  const timestamp = new Date().toISOString();
  console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

/**
 * Runs a script as a child process
 * @param {string} scriptPath - Path to the script to run
 * @returns {Promise<{success: boolean, output: string}>}
 */
function runScript(scriptPath) {
  return new Promise((resolve) => {
    log(`▶️  Running: ${scriptPath}`, 'cyan');
    
    const child = spawn('node', [scriptPath], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'pipe'
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      // Log in real-time (dimmed)
      text.split('\n').filter(Boolean).forEach(line => {
        log(`  📝 ${line}`, 'dim');
      });
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      log(`  ⚠️  ${text}`, 'yellow');
    });

    child.on('close', (code) => {
      if (code === 0) {
        log(`✅ ${scriptPath} completed successfully`, 'green');
        resolve({ success: true, output });
      } else {
        log(`❌ ${scriptPath} failed with exit code ${code}`, 'red');
        resolve({ success: false, output: errorOutput || output });
      }
    });

    child.on('error', (error) => {
      log(`❌ Error running ${scriptPath}: ${error.message}`, 'red');
      resolve({ success: false, output: error.message });
    });
  });
}

/**
 * Runs the full fetch cycle
 */
async function runFetchCycle() {
  log('═══════════════════════════════════════════════════════', 'bright');
  log('🔄 Starting automated fetch cycle', 'bright');
  log('═══════════════════════════════════════════════════════', 'bright');

  const startTime = Date.now();
  let allSuccessful = true;

  // Step 1: Fetch showing requests from Supabase
  log('📥 Step 1/2: Fetching showing requests from Supabase...', 'blue');
  const showingsResult = await runScript('fetch-showing-requests.js');
  
  if (!showingsResult.success) {
    log('⚠️  Fetch showing requests failed, but continuing to address fetch...', 'yellow');
    allSuccessful = false;
  }

  // Small delay between operations
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Step 2: Fetch property addresses
  log('📍 Step 2/2: Resolving property addresses...', 'blue');
  const addressesResult = await runScript('fetch-property-addresses.js');
  
  if (!addressesResult.success) {
    log('⚠️  Fetch property addresses failed', 'yellow');
    allSuccessful = false;
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  if (allSuccessful) {
    log(`✅ Fetch cycle completed successfully in ${duration}s`, 'green');
  } else {
    log(`⚠️  Fetch cycle completed with errors in ${duration}s`, 'yellow');
  }
  
  log('═══════════════════════════════════════════════════════', 'bright');

  return allSuccessful;
}

/**
 * Scheduler main loop
 */
async function startScheduler() {
  if (!ENABLED) {
    log('⏸️  Auto-fetch is disabled (ENABLE_AUTO_FETCH=false)', 'yellow');
    log('   The scheduler will not run. Set ENABLE_AUTO_FETCH=true to enable.', 'dim');
    return;
  }

  log('', 'reset');
  log('╔═══════════════════════════════════════════════════════╗', 'cyan');
  log('║     🤖 BrokerBay Auto-Fetch Scheduler Started        ║', 'cyan');
  log('╚═══════════════════════════════════════════════════════╝', 'cyan');
  log('', 'reset');
  log(`⏰ Fetch interval: ${FETCH_INTERVAL_MS / 60000} minutes`, 'blue');
  log(`🔄 Retry delay: ${RETRY_DELAY_MS / 60000} minutes on error`, 'blue');
  log('', 'reset');

  // Run immediately on startup
  log('🚀 Running initial fetch cycle on startup...', 'bright');
  await runFetchCycle();

  // Schedule recurring runs
  let nextRunTime = Date.now() + FETCH_INTERVAL_MS;
  
  const scheduleNext = (delayMs = FETCH_INTERVAL_MS) => {
    nextRunTime = Date.now() + delayMs;
    const nextRunDate = new Date(nextRunTime);
    log(`⏭️  Next run scheduled for: ${nextRunDate.toLocaleString()}`, 'cyan');
    log(`   (in ${Math.round(delayMs / 60000)} minutes)`, 'dim');
    log('', 'reset');
  };

  scheduleNext();

  // Main scheduler loop
  setInterval(async () => {
    const now = Date.now();
    
    if (now >= nextRunTime) {
      const success = await runFetchCycle();
      
      if (success) {
        // Schedule next run at regular interval
        scheduleNext(FETCH_INTERVAL_MS);
      } else {
        // Schedule retry sooner if there was an error
        log(`⚠️  Error detected, will retry in ${RETRY_DELAY_MS / 60000} minutes...`, 'yellow');
        scheduleNext(RETRY_DELAY_MS);
      }
    }
  }, 30000); // Check every 30 seconds
}

/**
 * Graceful shutdown handler
 */
function shutdown() {
  log('', 'reset');
  log('👋 Scheduler shutting down gracefully...', 'yellow');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  log(`💥 Uncaught exception: ${error.message}`, 'red');
  log(error.stack, 'dim');
});

process.on('unhandledRejection', (reason, promise) => {
  log(`💥 Unhandled rejection at: ${promise}`, 'red');
  log(`Reason: ${reason}`, 'red');
});

// Start the scheduler
startScheduler().catch((error) => {
  log(`💥 Fatal error: ${error.message}`, 'red');
  log(error.stack, 'dim');
  process.exit(1);
});

