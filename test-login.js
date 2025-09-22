#!/usr/bin/env node

import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { loginToBrokerBay, waitFor } from "./src/utils.js";

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
      
      // Wait a bit to see the dashboard
      await waitFor(5000);
      
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
