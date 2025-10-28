#!/usr/bin/env node

import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { loginToBrokerBay, waitFor } from "./src/utils.js";

puppeteer.use(StealthPlugin());
configDotenv();

async function debugSearchComprehensive() {
  let browser;
  
  try {
    console.log("🔍 COMPREHENSIVE DEBUG: Testing search functionality...");
    
    browser = await puppeteer.launch({
      headless: false,
      executablePath: process.env.BROWSER_EXECUTABLE_PATH,
      userDataDir: process.env.BROWSER_PROFILE_USERDATA,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--profile-directory=Profile 1",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--remote-debugging-port=9236"
      ],
    });

    const page = await browser.newPage();
    
    // Enable console logging
    page.on('console', msg => {
      console.log(`🖥️ CONSOLE: ${msg.text()}`);
    });
    
    // Enable network request logging
    page.on('request', request => {
      if (request.url().includes('search') || request.url().includes('api')) {
        console.log(`🌐 REQUEST: ${request.method()} ${request.url()}`);
      }
    });
    
    page.on('response', response => {
      if (response.url().includes('search') || response.url().includes('api')) {
        console.log(`📡 RESPONSE: ${response.status()} ${response.url()}`);
      }
    });
    
    // Login
    const loginSuccess = await loginToBrokerBay(page);
    if (!loginSuccess) {
      console.log("❌ Login failed");
      return;
    }
    
    console.log("✅ Login successful");
    
    // Navigate to dashboard
    console.log("⏳ Navigating to dashboard...");
    await page.goto("https://edge.brokerbay.com/#/my_business", { waitUntil: 'domcontentloaded' });
    await waitFor(5000);
    
    console.log(`🌐 Dashboard URL: ${page.url()}`);
    
    // Take screenshot before search
    await page.screenshot({ path: 'debug-before-search-comprehensive.png', fullPage: true });
    console.log("📸 Screenshot before search: debug-before-search-comprehensive.png");
    
    const searchQuery = "1 Concorde Place #405";
    console.log(`🔍 Testing search for: "${searchQuery}"`);
    
    // Find the search input
    const searchInput = await page.$('input[placeholder*="Search listings or agents"]');
    if (!searchInput) {
      console.log("❌ Search input not found");
      return;
    }
    
    console.log("✅ Found search input");
    
    // Clear and type search query
    await searchInput.click({ clickCount: 3 });
    await searchInput.evaluate(el => {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await searchInput.type(searchQuery, { delay: 50 });
    
    console.log("⏳ Waiting 2 seconds before submitting...");
    await waitFor(2000);
    
    // Try different submission methods
    console.log("\n🔍 Method 1: Using Enter key...");
    await page.keyboard.press('Enter');
    
    console.log("⏳ Waiting for results...");
    await waitFor(5000);
    
    // Check for modal
    let modal = await page.$('[role="dialog"], .ant-modal, .ant-drawer');
    console.log(`📋 Modal present after Enter: ${modal ? 'YES' : 'NO'}`);
    
    if (modal) {
      const modalContent = await modal.evaluate(el => el.textContent);
      console.log(`📄 Modal content length: ${modalContent.length}`);
      console.log(`📄 Modal content: "${modalContent}"`);
      
      const modalHTML = await modal.evaluate(el => el.innerHTML);
      console.log(`📄 Modal HTML length: ${modalHTML.length}`);
      console.log(`📄 Modal HTML preview: "${modalHTML.substring(0, 500)}..."`);
    }
    
    await page.screenshot({ path: 'debug-after-enter.png', fullPage: true });
    console.log("📸 Screenshot after Enter: debug-after-enter.png");
    
    // Try Shift+Enter
    console.log("\n🔍 Method 2: Using Shift+Enter...");
    await searchInput.click({ clickCount: 3 });
    await searchInput.evaluate(el => {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await searchInput.type(searchQuery, { delay: 50 });
    
    await page.keyboard.down('Shift');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Shift');
    
    console.log("⏳ Waiting for results...");
    await waitFor(5000);
    
    modal = await page.$('[role="dialog"], .ant-modal, .ant-drawer');
    console.log(`📋 Modal present after Shift+Enter: ${modal ? 'YES' : 'NO'}`);
    
    if (modal) {
      const modalContent = await modal.evaluate(el => el.textContent);
      console.log(`📄 Modal content length: ${modalContent.length}`);
      console.log(`📄 Modal content: "${modalContent}"`);
    }
    
    await page.screenshot({ path: 'debug-after-shift-enter.png', fullPage: true });
    console.log("📸 Screenshot after Shift+Enter: debug-after-shift-enter.png");
    
    // Try triggering input events
    console.log("\n🔍 Method 3: Triggering input events...");
    await searchInput.click({ clickCount: 3 });
    await searchInput.evaluate(el => {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await searchInput.type(searchQuery, { delay: 50 });
    
    // Trigger multiple events
    await searchInput.evaluate(el => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('keyup', { bubbles: true }));
      el.dispatchEvent(new Event('keydown', { bubbles: true }));
    });
    
    await page.keyboard.press('Enter');
    
    console.log("⏳ Waiting for results...");
    await waitFor(5000);
    
    modal = await page.$('[role="dialog"], .ant-modal, .ant-drawer');
    console.log(`📋 Modal present after input events: ${modal ? 'YES' : 'NO'}`);
    
    if (modal) {
      const modalContent = await modal.evaluate(el => el.textContent);
      console.log(`📄 Modal content length: ${modalContent.length}`);
      console.log(`📄 Modal content: "${modalContent}"`);
    }
    
    await page.screenshot({ path: 'debug-after-input-events.png', fullPage: true });
    console.log("📸 Screenshot after input events: debug-after-input-events.png");
    
    // Check for any JavaScript errors
    console.log("\n🔍 Checking for JavaScript errors...");
    const errors = await page.evaluate(() => {
      return window.errors || [];
    });
    if (errors.length > 0) {
      console.log("❌ JavaScript errors found:", errors);
    } else {
      console.log("✅ No JavaScript errors detected");
    }
    
    // Check if search is working by looking at network requests
    console.log("\n🔍 Checking network requests...");
    const requests = await page.evaluate(() => {
      return window.performance.getEntriesByType('resource')
        .filter(entry => entry.name.includes('search') || entry.name.includes('api'))
        .map(entry => ({
          url: entry.name,
          duration: entry.duration,
          status: entry.responseStatus
        }));
    });
    
    if (requests.length > 0) {
      console.log("🌐 Search-related network requests found:");
      requests.forEach(req => console.log(`  ${req.url} (${req.duration}ms, status: ${req.status})`));
    } else {
      console.log("❌ No search-related network requests found");
    }
    
    console.log("\n🔍 Final analysis:");
    console.log("1. Search input found: ✅");
    console.log("2. Search query typed: ✅");
    console.log("3. Modal appears: " + (modal ? "✅" : "❌"));
    console.log("4. Modal has content: " + (modal && modalContent && modalContent.length > 10 ? "✅" : "❌"));
    console.log("5. Search results loaded: " + (modal && modalContent && modalContent.includes(searchQuery) ? "✅" : "❌"));
    
  } catch (error) {
    console.error("❌ Debug failed:", error);
  } finally {
    console.log("\n🔍 Browser will stay open for 60 seconds for manual inspection...");
    await new Promise(resolve => setTimeout(resolve, 60000));
    if (browser) {
      await browser.close();
    }
  }
}

debugSearchComprehensive();
