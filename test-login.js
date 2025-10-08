#!/usr/bin/env node

import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { loginToBrokerBay, waitFor, performDashboardSearch } from "./src/utils.js";
import { manualApiSearchAndScrape } from "./src/property-scraper/ManualApiSearch.js";

puppeteer.use(StealthPlugin());
configDotenv();

async function testLogin() {
  let browser;
  
  try {
    console.log("🔐 Testing automated Broker Bay login...");
    
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
        "--remote-debugging-port=9232"
      ],
    });

    const page = await browser.newPage();
    
    // Test the login function
    const loginSuccess = await loginToBrokerBay(page);
    
    if (loginSuccess) {
      console.log("✅ Login test successful!");
      console.log(`🌐 Current URL: ${page.url()}`);
      
      // Run dashboard search on the RIGHT search bar
      const searchQuery = process.argv[2] || process.env.SEARCH_QUERY || "123 Main St";
      console.log(`🔎 Performing dashboard search for: ${searchQuery}`);
      const searchOk = await performDashboardSearch(page, searchQuery);
      if (!searchOk) {
        console.log("⚠️ Dashboard search did not complete successfully");
      }

    // Use manual API search approach to bypass modal issues
    console.log("🎯 Using manual API search approach...");
    const result = await manualApiSearchAndScrape(page, browser, searchQuery);
      
      if (result) {
        if (result.property) {
          console.log("✅ Property data scraped and saved:", result.property.property_id);
        }
        if (result.appointment) {
          console.log("✅ Appointment data scraped and saved:", result.appointment.appointment_id);
        }
        console.log("📊 Both property and appointment data have been saved to the database");
      } else {
        console.log("❌ Failed to get search results from API");
        console.log("💡 The search API may not be returning results for this query");
      }
      
      // Take a screenshot
      await page.screenshot({ path: 'brokerbay-dashboard.png', fullPage: true });
      console.log("📸 Screenshot saved as 'brokerbay-dashboard.png'");
      
    } else {
      console.log("❌ Login test failed!");
    }
    
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    console.log("🔍 Browser will stay open for 30 seconds...");
    await new Promise(resolve => setTimeout(resolve, 30000));
    if (browser) {
      await browser.close();
    }
  }
}

testLogin();
