#!/usr/bin/env node

import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());
configDotenv();

async function loginToBrokerBay() {
  let browser;
  
  try {
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
        "--remote-debugging-port=9230",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-default-apps",
        "--disable-popup-blocking"
      ],
    });

    console.log("🔐 Logging into Broker Bay...");
    const page = await browser.newPage();
    
    // Navigate to Broker Bay
    await page.goto("https://brokerbay.ca");
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const currentUrl = page.url();
    console.log(`🌐 Current URL: ${currentUrl}`);
    
    // Check if already logged in
    if (!currentUrl.includes('login') && !currentUrl.includes('signin')) {
      console.log("✅ Already logged in!");
      
      // Try to find search functionality
      const searchInputs = await page.$$eval('input', inputs => 
        inputs.map(input => ({
          type: input.type,
          placeholder: input.placeholder,
          name: input.name,
          id: input.id,
          className: input.className,
          visible: input.offsetParent !== null
        })).filter(input => input.visible)
      );
      
      console.log("🔍 Available search inputs:");
      searchInputs.forEach((input, i) => {
        console.log(`${i + 1}. Type: ${input.type}, Placeholder: "${input.placeholder}", Name: "${input.name}"`);
      });
      
      return;
    }
    
    console.log("❌ Not logged in. Please provide your Broker Bay credentials:");
    
    // Look for login form
    const emailInput = await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email"]', { timeout: 10000 });
    const passwordInput = await page.waitForSelector('input[type="password"], input[name="password"]', { timeout: 10000 });
    
    if (emailInput && passwordInput) {
      console.log("📧 Found login form. Please enter your credentials manually in the browser window.");
      console.log("⏳ Waiting for you to complete login...");
      
      // Wait for user to complete login (check for URL change or logout button)
      await page.waitForFunction(() => {
        return !window.location.href.includes('login') && !window.location.href.includes('signin');
      }, { timeout: 120000 }); // 2 minutes timeout
      
      console.log("✅ Login completed!");
      
      // Now try to find search functionality
      const searchInputs = await page.$$eval('input', inputs => 
        inputs.map(input => ({
          type: input.type,
          placeholder: input.placeholder,
          name: input.name,
          id: input.id,
          className: input.className,
          visible: input.offsetParent !== null
        })).filter(input => input.visible)
      );
      
      console.log("🔍 Available search inputs after login:");
      searchInputs.forEach((input, i) => {
        console.log(`${i + 1}. Type: ${input.type}, Placeholder: "${input.placeholder}", Name: "${input.name}"`);
      });
      
    } else {
      console.log("❌ Could not find login form");
    }
    
  } catch (error) {
    console.error("❌ Login failed:", error);
  } finally {
    console.log("🔍 Browser will stay open for 30 seconds for you to inspect...");
    await new Promise(resolve => setTimeout(resolve, 30000));
    if (browser) {
      await browser.close();
    }
  }
}

loginToBrokerBay();
