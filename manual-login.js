#!/usr/bin/env node

/**
 * Manual Login Helper for Broker Bay Automation
 * 
 * This script opens a visible Chrome browser for you to manually complete
 * the MFA login process. Once logged in, the session is saved and can be
 * reused by all automation scripts.
 * 
 * Usage:
 *   node manual-login.js
 * 
 * Steps:
 *   1. Browser window opens with Broker Bay login page
 *   2. Complete MFA login (email, password, ID, PIN, OTP)
 *   3. Script detects successful login and saves session
 *   4. Browser stays open for 30 seconds for verification
 *   5. Session is ready for automation use
 */

import { configDotenv } from "dotenv";
import { launchWithSession, waitForManualLogin, getSessionPath, saveSessionMetadata } from "./src/session-manager.js";

configDotenv();

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
    let browser = null;
    let page = null;

    try {
        log('\n' + '═'.repeat(70), 'cyan');
        log('║  🔐 BROKER BAY MANUAL LOGIN HELPER                                 ║', 'cyan');
        log('═'.repeat(70) + '\n', 'cyan');

        log('📁 Session directory: ' + getSessionPath(), 'blue');
        log('🌐 Opening browser for manual login...\n', 'blue');

        // Launch browser in visible mode (headless = false)
        browser = await launchWithSession({
            headless: false,
            defaultViewport: { width: 1920, height: 1080 }
        });

        // Get the first page
        const pages = await browser.pages();
        page = pages[0] || await browser.newPage();

        // Navigate to Broker Bay login page
        log('🔗 Navigating to Broker Bay login page...', 'blue');
        await page.goto('https://auth.brokerbay.com/login?response_type=code&redirect_uri=https%3A%2F%2Fedge.brokerbay.com%2Foauth%2Fcallback&client_id=brokerbay%3Aauth%3Aapp', {
            waitUntil: 'domcontentloaded'
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Wait for user to complete login
        const loginSuccess = await waitForManualLogin(page, 600000); // 10 minute timeout

        if (loginSuccess) {
            log('\n' + '═'.repeat(70), 'green');
            log('║  ✅ LOGIN SUCCESSFUL - SESSION SAVED                               ║', 'green');
            log('═'.repeat(70), 'green');
            log('\n✨ Your Broker Bay session is now saved and ready to use!', 'green');
            log('🤖 All automation scripts will now use this session.', 'green');
            log('📝 No more manual logins needed until session expires!\n', 'green');

            log('ℹ️  Session typically lasts 7-30 days depending on Broker Bay settings.', 'blue');
            log('ℹ️  If automation fails with login errors, run this script again.\n', 'blue');

            log('🔍 Keeping browser open for 30 seconds for verification...', 'yellow');
            log('   You can close this window or press Ctrl+C to exit.\n', 'yellow');

            // Keep browser open for verification
            await new Promise(resolve => setTimeout(resolve, 30000));

            log('✅ Manual login process complete!', 'green');
            log('👋 Closing browser...\n', 'blue');

        } else {
            log('\n❌ Login was not completed within the timeout period.', 'yellow');
            log('💡 Please run this script again and complete the login faster.\n', 'yellow');
        }

    } catch (error) {
        log('\n❌ Error during manual login process:', 'yellow');
        log('   ' + error.message, 'yellow');
        log('\n💡 Troubleshooting tips:', 'blue');
        log('   1. Make sure Chrome/Chromium is installed', 'blue');
        log('   2. Check BROWSER_EXECUTABLE_PATH in .env file', 'blue');
        log('   3. Ensure you have a stable internet connection', 'blue');
        log('   4. Try running with: HEADLESS=false node manual-login.js\n', 'blue');

    } finally {
        if (browser) {
            await browser.close();
        }
        process.exit(0);
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
    log('\n\n👋 Manual login interrupted by user.', 'yellow');
    log('   Run this script again when ready to complete login.\n', 'yellow');
    process.exit(0);
});

main();
