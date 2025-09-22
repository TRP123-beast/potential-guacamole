#!/usr/bin/env node

import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());
configDotenv();

async function setupLogin() {
  let browser;
  
  try {
    console.log("🔐 Setting up Broker Bay login...");
    console.log("📝 This will open Chrome with your profile so you can log in manually");
    console.log("⏳ Please log in to Broker Bay in the browser window that opens");
    console.log("⏳ The browser will stay open for 2 minutes for you to complete login");
    
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
        "--remote-debugging-port=9231",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-default-apps",
        "--disable-popup-blocking"
      ],
    });

    const page = await browser.newPage();
    
    // Navigate to Broker Bay
    await page.goto("https://brokerbay.ca");
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log("🌐 Opened Broker Bay. Please log in manually in the browser window.");
    console.log("⏳ Waiting for login completion...");
    
    // Wait for user to complete login
    let loginCompleted = false;
    let attempts = 0;
    const maxAttempts = 40; // 2 minutes with 3-second intervals
    
    while (!loginCompleted && attempts < maxAttempts) {
      const currentUrl = page.url();
      const pageContent = await page.content();
      
      // Check if we're still on login page
      if (!currentUrl.includes('login') && !currentUrl.includes('signin') && 
          !pageContent.includes('Sign In') && !pageContent.includes('Login')) {
        loginCompleted = true;
        console.log("✅ Login completed! You can now close the browser.");
        break;
      }
      
      attempts++;
      console.log(`⏳ Waiting for login... (${attempts}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    if (loginCompleted) {
      console.log("🎉 Login setup complete! Your profile is now saved.");
      console.log("✅ You can now run the property scraper.");
    } else {
      console.log("⏰ Timeout waiting for login. Please try again.");
    }
    
    // Keep browser open for a bit more
    console.log("🔍 Browser will stay open for 30 more seconds...");
    await new Promise(resolve => setTimeout(resolve, 30000));
    
  } catch (error) {
    console.error("❌ Setup failed:", error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

setupLogin();
