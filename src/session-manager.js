import { configDotenv } from "dotenv";
import path from "path";
import fs from "fs/promises";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());
configDotenv();

/**
 * Session Manager for Broker Bay Automation
 * Handles persistent browser sessions to avoid repeated MFA logins
 */

// Get the persistent session directory path
export function getSessionPath() {
    // Use environment variable or default to local config directory
    const sessionDir = process.env.BROWSER_PROFILE_USERDATA ||
        path.join(process.env.HOME || '/tmp', '.config', 'brokerbay-chrome-profile');
    return sessionDir;
}

// Get session metadata file path
function getSessionMetadataPath() {
    return path.join(getSessionPath(), '.session-metadata.json');
}

// Read session metadata
export async function getSessionMetadata() {
    try {
        const metadataPath = getSessionMetadataPath();
        const data = await fs.readFile(metadataPath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // Return default metadata if file doesn't exist
        return {
            lastLogin: null,
            isValid: false,
            userEmail: process.env.BROKERBAY_USERNAME || process.env.USER_EMAIL,
            createdAt: null
        };
    }
}

// Save session metadata
export async function saveSessionMetadata(metadata) {
    try {
        const sessionDir = getSessionPath();
        await fs.mkdir(sessionDir, { recursive: true });

        const metadataPath = getSessionMetadataPath();
        const data = {
            ...metadata,
            lastUpdated: new Date().toISOString()
        };

        await fs.writeFile(metadataPath, JSON.stringify(data, null, 2));
        console.log('✅ Session metadata saved');
        return true;
    } catch (error) {
        console.error('❌ Failed to save session metadata:', error.message);
        return false;
    }
}

// Check if session is valid by testing login status
export async function isSessionValid(page, skipNavigationIfOnBrokerBay = false) {
    try {
        console.log('🔍 Checking if session is still valid...');

        const currentUrl = page.url();

        // If we're on the auth page, session is invalid
        if (currentUrl.includes('auth.brokerbay.com') || currentUrl.includes('/login')) {
            console.log('❌ Session invalid - on login page');
            return false;
        }

        // If we're already on a BrokerBay page (not login) and skipNavigation is true,
        // just verify we're logged in without navigating
        if (skipNavigationIfOnBrokerBay && currentUrl.includes('edge.brokerbay.com')) {
            console.log('  ℹ️  Already on BrokerBay page, skipping navigation');

            await new Promise(resolve => setTimeout(resolve, 1000));

            const pageContent = await page.content();

            // Check for login indicators
            const isLoggedOut = pageContent.includes('Sign In') ||
                pageContent.includes('You have been logged out') ||
                pageContent.includes('Please log in');

            if (isLoggedOut) {
                console.log('❌ Session invalid - login required');
                return false;
            }

            console.log('✅ Session is valid - already logged in on current page');
            return true;
        }

        // Navigate to dashboard to verify login
        console.log('  ℹ️  Navigating to dashboard to verify session...');
        await page.goto('https://edge.brokerbay.com/#/my_business', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        await new Promise(resolve => setTimeout(resolve, 3000));

        const finalUrl = page.url();
        const pageContent = await page.content();

        // Check for login indicators
        const isLoggedOut = finalUrl.includes('auth.brokerbay.com') ||
            finalUrl.includes('/login') ||
            pageContent.includes('Sign In') ||
            pageContent.includes('You have been logged out');

        if (isLoggedOut) {
            console.log('❌ Session invalid - redirected to login');
            return false;
        }

        console.log('✅ Session is valid - still logged in');
        return true;

    } catch (error) {
        console.error('❌ Error checking session validity:', error.message);
        return false;
    }
}

// Launch browser with persistent session
export async function launchWithSession(options = {}) {
    const debugPort = process.env.BROWSER_DEBUG_PORT || 9222;
    const debugUrl = `http://127.0.0.1:${debugPort}/json/version`;

    // Try to connect to existing browser first
    try {
        console.log(`🔍 Checking for existing browser on port ${debugPort}...`);
        const { data } = await import("axios").then(m => m.default.get(debugUrl));

        if (data && data.webSocketDebuggerUrl) {
            console.log(`✅ Found existing browser! Connecting to: ${data.webSocketDebuggerUrl}`);

            const browser = await puppeteer.connect({
                browserWSEndpoint: data.webSocketDebuggerUrl,
                defaultViewport: options.defaultViewport || { width: 1920, height: 1080 },
                ...options
            });

            // Mark as existing session so we don't close it completely later
            browser.isConnectedToExisting = true;

            console.log('✅ Successfully connected to existing browser session');
            return browser;
        }
    } catch (error) {
        console.log(`ℹ️  No existing browser found on port ${debugPort} (or connection failed). Launching new instance...`);
        console.log(`   Error details: ${error.message}`);
    }

    // Fallback to launching new instance
    try {
        const sessionDir = getSessionPath();

        // Ensure session directory exists
        await fs.mkdir(sessionDir, { recursive: true });

        console.log(`🚀 Launching browser with persistent session: ${sessionDir}`);

        const launchOptions = {
            headless: options.headless !== undefined ? options.headless : (process.env.HEADLESS !== 'false'),
            executablePath: process.env.BROWSER_EXECUTABLE_PATH || undefined,
            userDataDir: sessionDir,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-default-apps',
                '--disable-popup-blocking',
                '--disable-translate',
                '--disable-background-timer-throttling',
                '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows',
                '--disable-client-side-phishing-detection',
                '--disable-sync',
                '--metrics-recording-only',
                '--no-report-upload',
                '--disable-ipc-flooding-protection',
                ...(options.args || [])
            ],
            ...options
        };

        // Enable remote debugging so we can reconnect to this instance later
        launchOptions.args.push(`--remote-debugging-port=${debugPort}`);

        const browser = await puppeteer.launch(launchOptions);
        console.log('✅ Browser launched with persistent session');

        return browser;

    } catch (error) {
        console.error('❌ Failed to launch browser with session:', error.message);
        throw error;
    }
}

// Wait for user to complete manual login
export async function waitForManualLogin(page, timeout = 300000) {
    console.log('\n' + '='.repeat(70));
    console.log('🔐 MANUAL LOGIN REQUIRED');
    console.log('='.repeat(70));
    console.log('\n📋 Instructions:');
    console.log('   1. Complete the login process in the browser window');
    console.log('   2. Enter your email: ' + (process.env.BROKERBAY_USERNAME || process.env.USER_EMAIL));
    console.log('   3. Enter your password');
    console.log('   4. Complete MFA:');
    console.log('      - ID: ' + (process.env.ID || '9562344'));
    console.log('      - PIN: ' + (process.env.PIN || '2542'));
    console.log('      - OTP: Check your email for the code');
    console.log('   5. Wait for the dashboard to load');
    console.log('\n⏳ Waiting for successful login (timeout: ' + (timeout / 1000) + 's)...\n');

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        try {
            const currentUrl = page.url();

            // Check if we've successfully reached the dashboard
            if (currentUrl.includes('edge.brokerbay.com') &&
                !currentUrl.includes('auth.brokerbay.com') &&
                !currentUrl.includes('/login')) {

                // Double-check by looking at page content
                const pageContent = await page.content();
                const isLoggedIn = !pageContent.includes('Sign In') &&
                    !pageContent.includes('You have been logged out');

                if (isLoggedIn) {
                    console.log('\n✅ Login detected! Verifying session...');
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // Final verification
                    if (await isSessionValid(page)) {
                        console.log('✅ Session verified and saved!');

                        // Save session metadata
                        await saveSessionMetadata({
                            lastLogin: new Date().toISOString(),
                            isValid: true,
                            userEmail: process.env.BROKERBAY_USERNAME || process.env.USER_EMAIL,
                            createdAt: new Date().toISOString()
                        });

                        return true;
                    }
                }
            }

            // Wait before checking again
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
            // Continue waiting
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    console.error('\n❌ Login timeout - manual login not completed within ' + (timeout / 1000) + ' seconds');
    return false;
}

// Validate session before automation
export async function validateSessionOrPrompt(page, skipIfOnBrokerBay = false) {
    const isValid = await isSessionValid(page, skipIfOnBrokerBay);

    if (!isValid) {
        console.error('\n' + '='.repeat(70));
        console.error('❌ SESSION EXPIRED OR INVALID');
        console.error('='.repeat(70));
        console.error('\n⚠️  Your Broker Bay session has expired.');
        console.error('📝 To fix this, run the manual login script:');
        console.error('\n   node manual-login.js\n');
        console.error('Then complete the MFA login process in the browser.');
        console.error('='.repeat(70) + '\n');

        throw new Error('Session expired - manual login required');
    }

    return true;
}

// ==================== SHARED BROWSER SINGLETON ====================
let _sharedBrowser = null;

/**
 * Get (or create) a shared browser instance.
 * Use this from the worker to hold a single long-lived browser.
 * Tries CDP connection first, then launches a new headless instance.
 *
 * @param {Object} [options] - options forwarded to launchWithSession
 * @returns {Promise<import('puppeteer').Browser>}
 */
export async function getSharedBrowser(options = {}) {
    if (_sharedBrowser && isBrowserAlive()) {
        return _sharedBrowser;
    }

    console.log('🌐 [SESSION] Initializing shared browser instance...');
    _sharedBrowser = await launchWithSession(options);
    console.log('✅ [SESSION] Shared browser ready');
    return _sharedBrowser;
}

/**
 * Check whether the shared browser is still alive and connected.
 * @returns {boolean}
 */
export function isBrowserAlive() {
    try {
        return _sharedBrowser && _sharedBrowser.isConnected();
    } catch {
        return false;
    }
}

/**
 * Close the shared browser cleanly.
 */
export async function closeSharedBrowser() {
    if (!_sharedBrowser) return;
    try {
        if (_sharedBrowser.isConnectedToExisting) {
            console.log('🔌 [SESSION] Disconnecting from existing browser (not closing)');
            _sharedBrowser.disconnect();
        } else {
            console.log('🛑 [SESSION] Closing shared browser');
            await _sharedBrowser.close();
        }
    } catch (err) {
        console.error(`⚠️  [SESSION] Error closing browser: ${err.message}`);
    } finally {
        _sharedBrowser = null;
    }
}

export default {
    getSessionPath,
    getSessionMetadata,
    saveSessionMetadata,
    isSessionValid,
    launchWithSession,
    waitForManualLogin,
    validateSessionOrPrompt,
    getSharedBrowser,
    isBrowserAlive,
    closeSharedBrowser
};
