import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { loginAndSearch } from "./src/utils.js";

puppeteer.use(StealthPlugin());
configDotenv();

const testLoginAndSearch = async () => {
  console.log("🔐 Testing login and search functionality...");
  
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
        "--remote-debugging-port=9226"
      ],
    });

    const page = await browser.newPage();
    
    // Test search for first property
    console.log("🔍 Testing search for: 101 Lake Drive N");
    const searchSuccess1 = await loginAndSearch(page, "101 Lake Drive N");
    
    if (searchSuccess1) {
      console.log("✅ Search 1 successful!");
      await page.screenshot({ path: 'search1-results.png' });
    } else {
      console.log("❌ Search 1 failed");
    }
    
    // Wait a bit between searches
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Test search for second property
    console.log("🔍 Testing search for: 10 Navy Wharf Court #3209");
    const searchSuccess2 = await loginAndSearch(page, "10 Navy Wharf Court #3209");
    
    if (searchSuccess2) {
      console.log("✅ Search 2 successful!");
      await page.screenshot({ path: 'search2-results.png' });
    } else {
      console.log("❌ Search 2 failed");
    }
    
    console.log("🎉 Login and search test completed!");
    console.log("📸 Screenshots saved as 'search1-results.png' and 'search2-results.png'");
    
    // Keep browser open for 30 seconds to see results
    console.log("🔍 Browser will stay open for 30 seconds...");
    await new Promise(resolve => setTimeout(resolve, 30000));
    
  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
};

testLoginAndSearch();
