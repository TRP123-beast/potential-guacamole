#!/usr/bin/env node

import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());
configDotenv();

async function debugBrokerBay() {
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
        "--remote-debugging-port=9229"
      ],
    });

    console.log("🔍 Debugging Broker Bay structure...");
    const page = await browser.newPage();
    
    // Navigate to Broker Bay
    await page.goto("https://brokerbay.ca");
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log("📄 Page loaded. Checking login status...");
    
    // Check if we're logged in by looking for login indicators
    const loginIndicators = await page.$$eval('*', elements => {
      const indicators = [];
      elements.forEach(el => {
        const text = el.textContent.toLowerCase();
        if (text.includes('login') || text.includes('sign in') || text.includes('logout') || text.includes('sign out') || text.includes('profile') || text.includes('account')) {
          indicators.push({
            tag: el.tagName,
            text: text.substring(0, 50),
            className: el.className
          });
        }
      });
      return indicators.slice(0, 10);
    });
    
    console.log("🔐 Login indicators found:");
    loginIndicators.forEach((indicator, i) => {
      console.log(`${i + 1}. ${indicator.tag}: "${indicator.text}..." (class: ${indicator.className})`);
    });
    
    // Check current URL to see if we're redirected to login
    const currentUrl = page.url();
    console.log(`🌐 Current URL: ${currentUrl}`);
    
    if (currentUrl.includes('login') || currentUrl.includes('signin')) {
      console.log("❌ Not logged in - redirected to login page");
    } else {
      console.log("✅ Appears to be logged in or on main page");
    }
    
    console.log("\n📄 Analyzing page structure...");
    
    // Get all input elements
    const inputs = await page.$$eval('input', inputs => 
      inputs.map(input => ({
        type: input.type,
        placeholder: input.placeholder,
        name: input.name,
        id: input.id,
        className: input.className
      }))
    );
    
    console.log("🔍 Found input elements:");
    inputs.forEach((input, i) => {
      console.log(`${i + 1}. Type: ${input.type}, Placeholder: "${input.placeholder}", Name: "${input.name}", ID: "${input.id}"`);
    });
    
    // Get all elements that might contain property listings
    const potentialPropertyContainers = await page.$$eval('*', elements => {
      const containers = [];
      elements.forEach(el => {
        const className = el.className;
        const id = el.id;
        const tagName = el.tagName;
        
        if (className && typeof className === 'string' && (
          className.includes('property') || 
          className.includes('listing') || 
          className.includes('card') ||
          className.includes('item')
        )) {
          containers.push({
            tag: tagName,
            className: className,
            id: id,
            textContent: el.textContent.substring(0, 100)
          });
        }
      });
      return containers.slice(0, 20); // Limit to first 20
    });
    
    console.log("\n🏠 Potential property containers:");
    potentialPropertyContainers.forEach((container, i) => {
      console.log(`${i + 1}. ${container.tag} - Class: "${container.className}", ID: "${container.id}"`);
      console.log(`   Text: "${container.textContent}..."`);
    });
    
    // Take a screenshot for visual debugging
    await page.screenshot({ path: 'brokerbay-debug.png', fullPage: true });
    console.log("\n📸 Screenshot saved as 'brokerbay-debug.png'");
    
    console.log("\n✅ Debug complete! Check the console output and screenshot.");
    
  } catch (error) {
    console.error("❌ Debug failed:", error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

debugBrokerBay();
