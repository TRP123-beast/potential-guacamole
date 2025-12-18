#!/usr/bin/env node

/**
 * Test Date Selection Script
 * 
 * This script allows you to test the date selection functionality locally
 * without running the full auto-booking automation.
 * 
 * Usage: node test-date-selection.js [date]
 * Examples:
 *   node test-date-selection.js 25
 *   node test-date-selection.js 2025-12-25
 *   node test-date-selection.js   (uses current day)
 */

import { configDotenv } from "dotenv";

configDotenv();

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Get current date info
const now = new Date();
const currentDay = now.getDate();
const currentMonth = now.getMonth();
const currentYear = now.getFullYear();
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December'];
const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

// Get preferred date from command line
const args = process.argv.slice(2);
const preferredDate = args[0];

console.log('\n' + '='.repeat(60));
log('  📅 Date Selection Test', 'cyan');
console.log('='.repeat(60) + '\n');

log(`Current Date: ${monthNames[currentMonth]} ${currentDay}, ${currentYear}`, 'cyan');
log(`Current Month: ${monthNames[currentMonth]} (${daysInMonth} days)`, 'dim');
log(`Today is day: ${currentDay}`, 'dim');
log(`Valid days this month: ${currentDay} - ${daysInMonth}`, 'dim');
console.log();

function validateDate(dateInput) {
  if (!dateInput) {
    return {
      valid: true,
      day: currentDay,
      message: 'No date provided, will use current day'
    };
  }

  let dayToSelect;
  
  // Handle different input formats
  if (dateInput.includes('-')) {
    // Format: "YYYY-MM-DD"
    const dateObj = new Date(dateInput);
    dayToSelect = dateObj.getDate();
    const inputMonth = dateObj.getMonth();
    const inputYear = dateObj.getFullYear();
    
    if (inputMonth !== currentMonth || inputYear !== currentYear) {
      return {
        valid: false,
        day: dayToSelect,
        message: `Date ${dateInput} is not in current month (${monthNames[currentMonth]} ${currentYear})`
      };
    }
  } else {
    // Format: just the day number
    dayToSelect = parseInt(dateInput, 10);
  }
  
  // Validate the day
  if (isNaN(dayToSelect)) {
    return {
      valid: false,
      day: null,
      message: `Invalid day: "${dateInput}". Must be a number between 1-31`
    };
  }
  
  if (dayToSelect < 1 || dayToSelect > 31) {
    return {
      valid: false,
      day: dayToSelect,
      message: `Day ${dayToSelect} is out of range. Must be 1-31`
    };
  }
  
  if (dayToSelect > daysInMonth) {
    return {
      valid: false,
      day: dayToSelect,
      message: `Day ${dayToSelect} doesn't exist in ${monthNames[currentMonth]} (only ${daysInMonth} days)`
    };
  }
  
  if (dayToSelect < currentDay) {
    return {
      valid: false,
      day: dayToSelect,
      message: `Day ${dayToSelect} is in the past. Today is ${currentDay}`
    };
  }
  
  return {
    valid: true,
    day: dayToSelect,
    message: 'Date is valid'
  };
}

// Validate the input
const validation = validateDate(preferredDate);

console.log('INPUT:');
log(`  Preferred Date: ${preferredDate || '(none - will use today)'}`, 'cyan');
console.log();

console.log('VALIDATION:');
if (validation.valid) {
  log(`  ✅ ${validation.message}`, 'green');
  log(`  📅 Will select day: ${validation.day}`, 'green');
  log(`  📆 Full date: ${monthNames[currentMonth]} ${validation.day}, ${currentYear}`, 'green');
} else {
  log(`  ❌ ${validation.message}`, 'red');
  if (validation.day) {
    log(`  ℹ️  Attempted day: ${validation.day}`, 'yellow');
  }
  log(`  ✅ Valid range: ${currentDay} - ${daysInMonth}`, 'yellow');
}

console.log();
console.log('EXAMPLES OF VALID INPUT:');
log(`  node test-date-selection.js ${currentDay}`, 'dim');
log(`  node test-date-selection.js ${Math.min(currentDay + 5, daysInMonth)}`, 'dim');
log(`  node test-date-selection.js ${daysInMonth}`, 'dim');
log(`  node test-date-selection.js ${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`, 'dim');

console.log();
console.log('EXAMPLES OF INVALID INPUT:');
log(`  node test-date-selection.js ${currentDay - 1} (in the past)`, 'dim');
log(`  node test-date-selection.js ${daysInMonth + 1} (doesn't exist)`, 'dim');
log(`  node test-date-selection.js 35 (out of range)`, 'dim');
log(`  node test-date-selection.js abc (not a number)`, 'dim');

console.log();
console.log('='.repeat(60));

// Exit code based on validation
process.exit(validation.valid ? 0 : 1);

