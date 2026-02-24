#!/usr/bin/env node

/**
 * ===========================================================================
 *  EXPORT SESSION — Extract BrokerBay cookies from a running Chrome instance
 * ===========================================================================
 *
 *  Usage:
 *    1. Make sure Chrome is running with --remote-debugging-port=9222
 *    2. Run: node export-session.js
 *    3. The exported session is saved to src/data/exported-session.json
 *
 *  Why this exists:
 *    Flatpak Chrome encrypts cookies with GNOME Keyring. When the profile
 *    is mounted into Docker (which has no keyring), the cookies can't be
 *    decrypted. This script connects via CDP where cookies are already
 *    decrypted in memory, then saves them as plain JSON. The session-manager
 *    loads this file when launching in Docker.
 *
 * ===========================================================================
 */

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs/promises";
import path from "path";

puppeteer.use(StealthPlugin());

const DEBUG_PORT = parseInt(process.env.BROWSER_DEBUG_PORT || "9222");
const OUTPUT_PATH = process.env.SESSION_EXPORT_PATH || "src/data/exported-session.json";

async function exportSession() {
    console.log("\n══════════════════════════════════════════════════════════════");
    console.log("  📦 BrokerBay Session Exporter");
    console.log("══════════════════════════════════════════════════════════════\n");

    let browser;
    try {
        // Connect to the running Chrome
        console.log(`🔍 Connecting to Chrome on port ${DEBUG_PORT}...`);
        const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
        const data = await res.json();
        const wsUrl = data.webSocketDebuggerUrl;

        browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });
        browser.isConnectedToExisting = true;
        console.log("✅ Connected to browser\n");

        // 1. Extract ALL cookies (not just brokerbay — auth cookies may be on subdomains)
        console.log("🍪 Extracting cookies...");
        const pages = await browser.pages();
        const page = pages[0] || await browser.newPage();

        const client = await page.createCDPSession();
        const { cookies } = await client.send("Network.getAllCookies");

        // Filter to BrokerBay-relevant domains
        const relevantDomains = [
            "brokerbay.com",
            ".brokerbay.com",
            "edge.brokerbay.com",
            "auth.brokerbay.com",
            "api.brokerbay.com",
        ];

        const brokerBayCookies = cookies.filter((c) => {
            return relevantDomains.some(
                (d) => c.domain === d || c.domain.endsWith(d)
            );
        });

        console.log(
            `  Found ${cookies.length} total cookies, ${brokerBayCookies.length} BrokerBay-related`
        );

        // 2. Extract localStorage from BrokerBay pages
        console.log("📦 Extracting localStorage...");
        let localStorageData = {};

        // Find a BrokerBay page or navigate to one
        let bbPage = pages.find(
            (p) =>
                p.url().includes("brokerbay.com") &&
                !p.url().includes("auth.brokerbay.com/login")
        );

        if (!bbPage) {
            console.log("  ℹ️  No BrokerBay tab found, opening one to grab localStorage...");
            bbPage = await browser.newPage();
            await bbPage.goto("https://edge.brokerbay.com/#/my_business", {
                waitUntil: "domcontentloaded",
                timeout: 30000,
            });
            await new Promise((r) => setTimeout(r, 3000));
        }

        try {
            localStorageData = await bbPage.evaluate(() => {
                const data = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    data[key] = localStorage.getItem(key);
                }
                return data;
            });
            console.log(
                `  Found ${Object.keys(localStorageData).length} localStorage entries`
            );
        } catch (e) {
            console.log(`  ⚠️  Could not read localStorage: ${e.message}`);
        }

        // 3. Save to file
        const exportData = {
            exportedAt: new Date().toISOString(),
            exportedFrom: `localhost:${DEBUG_PORT}`,
            cookies: brokerBayCookies,
            localStorage: localStorageData,
            metadata: {
                totalCookiesInBrowser: cookies.length,
                brokerBayCookieCount: brokerBayCookies.length,
                localStorageKeyCount: Object.keys(localStorageData).length,
            },
        };

        // Ensure directory exists
        await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
        await fs.writeFile(OUTPUT_PATH, JSON.stringify(exportData, null, 2));

        console.log(`\n✅ Session exported to: ${OUTPUT_PATH}`);
        console.log(`   Cookies: ${brokerBayCookies.length}`);
        console.log(
            `   localStorage keys: ${Object.keys(localStorageData).length}`
        );
        console.log(`   File size: ${(JSON.stringify(exportData).length / 1024).toFixed(1)} KB`);

        // Show cookie domains for debugging
        const domainCounts = {};
        brokerBayCookies.forEach((c) => {
            domainCounts[c.domain] = (domainCounts[c.domain] || 0) + 1;
        });
        console.log("\n   Cookie domains:");
        Object.entries(domainCounts).forEach(([domain, count]) => {
            console.log(`     ${domain}: ${count} cookies`);
        });

        console.log("\n══════════════════════════════════════════════════════════════");
        console.log("  ✅ Done! Now push to Railway — the worker will load these");
        console.log("     cookies into its headless browser automatically.");
        console.log("══════════════════════════════════════════════════════════════\n");
    } catch (error) {
        if (error.message.includes("ECONNREFUSED")) {
            console.error("❌ Could not connect to Chrome on port " + DEBUG_PORT);
            console.error("   Make sure Chrome is running with:");
            console.error(`   flatpak run com.google.Chrome \\`);
            console.error(`     --remote-debugging-port=${DEBUG_PORT} \\`);
            console.error(
                `     --user-data-dir=$HOME/.var/app/com.google.Chrome/docker-profile`
            );
        } else {
            console.error(`❌ Error: ${error.message}`);
        }
        process.exit(1);
    } finally {
        if (browser) {
            browser.disconnect();
        }
    }
}

exportSession();
