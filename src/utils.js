import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import axios from "axios";
puppeteer.use(StealthPlugin());
configDotenv();
export const waitFor = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const createBrowserInstance = async () => {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
    userDataDir: process.env.BROWSER_PROFILE_USERDATA,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--profile-directory=Profile 1",
      "--disable-web-security",
      "--disable-features=VizDisplayCompositor",
      "--remote-debugging-port=9222",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-default-apps",
      "--disable-popup-blocking",
      "--disable-translate",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-client-side-phishing-detection",
      "--disable-sync",
      "--metrics-recording-only",
      "--no-report-upload",
      "--disable-ipc-flooding-protection"
    ],
  });
  return browser;
};

export const checkLoginStatus = async (page) => {
  try {
    console.log("🔍 Checking login status...");
    
    // Go to the main Broker Bay dashboard page to check if already logged in
    await page.goto("https://edge.brokerbay.com/#/my_business");
    await waitFor(3000);
    
    const currentUrl = page.url();
    const pageContent = await page.content();
    
    // Check if already logged in (not on auth page and no login indicators)
    if (!currentUrl.includes('auth.brokerbay.com') && 
        !currentUrl.includes('login') && 
        !pageContent.includes('Sign In') && 
        !pageContent.includes('Login') &&
        !pageContent.includes('You have been logged out')) {
      console.log("✅ Already logged in to Broker Bay!");
      return true;
    }
    
    console.log("❌ Not logged in to Broker Bay");
    return false;
    
  } catch (error) {
    console.log("❌ Error checking login status:", error.message);
    return false;
  }
};

export const loginToBrokerBay = async (page) => {
  try {
    console.log("🔐 Attempting automated login to Broker Bay...");
    
    // Navigate to the Broker Bay auth page
    await page.goto("https://auth.brokerbay.com/login?response_type=code&redirect_uri=https%3A%2F%2Fedge.brokerbay.com%2Foauth%2Fcallback&client_id=brokerbay%3Aauth%3Aapp");
    await waitFor(3000);
    
    // STEP 1: Enter email and click Continue
    console.log("📧 Step 1: Entering email...");
    await page.waitForSelector('input[type="email"], input[name="email"], input[placeholder*="email"]', { timeout: 10000 });
    
    const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email"]');
    if (emailInput) {
      await emailInput.click();
      await emailInput.evaluate(input => input.value = '');
      await emailInput.type(process.env.BROKERBAY_EMAIL || 'naheed.val@gmail.com');
      console.log("📧 Email entered");
    }
    
    // Click Continue button
    const continueSelectors = [
      'button:contains("Continue")',
      'button:contains("CONTINUE")',
      'button[type="submit"]',
      'input[type="submit"]',
      '[data-testid*="continue"]',
      '.continue-button',
      'button[class*="continue"]'
    ];
    
    let continueButton = null;
    for (const selector of continueSelectors) {
      try {
        continueButton = await page.$(selector);
        if (continueButton) break;
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (continueButton) {
      await continueButton.click();
      console.log("➡️ Continue button clicked");
    } else {
      await page.keyboard.press('Enter');
      console.log("➡️ Pressed Enter to continue");
    }
    
    // Wait for password page to load
    await waitFor(3000);
    
    // STEP 2: Enter password and click Log In
    console.log("🔑 Step 2: Entering password...");
    await page.waitForSelector('input[type="password"], input[name="password"]', { timeout: 10000 });
    
    const passwordInput = await page.$('input[type="password"], input[name="password"]');
    if (passwordInput) {
      await passwordInput.click();
      await passwordInput.evaluate(input => input.value = '');
      await passwordInput.type(process.env.BROKERBAY_PASSWORD || '2YbG.mW!6wZP?jf');
      console.log("🔑 Password entered");
    }
    
    // Click Log In button
    const loginSelectors = [
      'button:contains("Log In")',
      'button:contains("LOG IN")',
      'button:contains("Sign In")',
      'button:contains("SIGN IN")',
      'button[type="submit"]',
      'input[type="submit"]',
      '[data-testid*="login"]',
      '[data-testid*="signin"]',
      '.login-button',
      '.signin-button',
      'button[class*="login"]',
      'button[class*="signin"]'
    ];
    
    let loginButton = null;
    for (const selector of loginSelectors) {
      try {
        loginButton = await page.$(selector);
        if (loginButton) break;
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (loginButton) {
      await loginButton.click();
      console.log("🚀 Log In button clicked");
    } else {
      await page.keyboard.press('Enter');
      console.log("🚀 Pressed Enter to log in");
    }
    
    // Wait for redirect to dashboard
    console.log("⏳ Waiting for redirect to dashboard...");
    await page.waitForFunction(() => {
      return !window.location.href.includes('auth.brokerbay.com') && !window.location.href.includes('login');
    }, { timeout: 15000 });
    
    console.log("✅ Successfully logged in to Broker Bay!");
    return true;
    
  } catch (error) {
    console.log("❌ Automated login failed:", error.message);
    return false;
  }
};

export const loginAndSearch = async (page, searchAddress) => {
  try {
    console.log("🔐 Starting login and search process...");
    
    // First check if already logged in
    const isLoggedIn = await checkLoginStatus(page);
    
    if (!isLoggedIn) {
      console.log("🔐 Not logged in, proceeding with login...");
      const loginSuccess = await loginToBrokerBay(page);
      if (!loginSuccess) {
        console.log("❌ Failed to log in to Broker Bay");
        return false;
      }
    }
    
    // Wait for dashboard to fully load (20 seconds as requested)
    console.log("⏳ Waiting for dashboard to load (20 seconds)...");
    await waitFor(20000);
    
    // Navigate to search page if not already there
    const currentUrl = page.url();
    if (!currentUrl.includes('edge.brokerbay.com') || currentUrl.includes('auth.brokerbay.com')) {
      await page.goto("https://edge.brokerbay.com/#/my_business");
      await waitFor(3000);
    }
    
    // Perform search
    console.log(`🔍 Searching for: ${searchAddress}`);
    
    // Try multiple search input selectors
    const searchSelectors = [
      'input[type="search"]',
      'input[placeholder*="search"]',
      'input[placeholder*="address"]',
      'input[name="search"]',
      'input[name="vendor-search-handler"]',
      '#vendor-search-handler',
      'input[class*="search"]',
      'input[data-testid*="search"]'
    ];
    
    let searchInput = null;
    for (const selector of searchSelectors) {
      try {
        searchInput = await page.$(selector);
        if (searchInput) {
          console.log(`✅ Found search input with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (searchInput) {
      await searchInput.click();
      await searchInput.evaluate(input => input.value = '');
      await searchInput.type(searchAddress);
      await page.keyboard.press('Enter');
      await waitFor(5000);
      console.log(`✅ Search performed for: ${searchAddress}`);
      return true;
    } else {
      console.log("❌ No search input found");
      return false;
    }
    
  } catch (error) {
    console.log("❌ Login and search failed:", error.message);
    return false;
  }
};

export const sendPropertyToAnalysis = async (property) => {
  try {
    const response = await axios.post(`${process.env.API_URL}/property`, property, {
      headers: {
        "Content-Type": "application/json",
      },
    });
    return response.data;
  } catch (error) {
    console.log(
      `Failed to send property: ${
        error.response ? error.response.statusText : error.message
      }`
    );
  }
};

export const sendPriceChangeToAnalysis = async (priceChange) => {
  try {
    const response = await axios.post(
      `${process.env.API_URL}/property/price-change`,
      priceChange,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    return response.data;
  } catch (error) {
    console.log(
      `Failed to send price change: ${
        error.response ? error.response.statusText : error.message
      }`
    );
  }
};
export const writeToAFile = async (data, filePath) => {
  try {
    const jsonData = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, jsonData);
    console.log(`Data written to file: ${filePath}`);
  } catch (error) {
    console.log(
      `Failed to write data to file: ${
        error.code ? error.code : error.message
      }`
    );
  }
};

export const extractPropertyId = (url) => {
  const match = url.match(/\/property\/(\d+)/);
  return match ? match[1] : null;
};

export const parsePrice = (priceText) => {
  if (!priceText) return 0;
  const cleaned = priceText.replace(/[^0-9]/g, '');
  return parseInt(cleaned) || 0;
};

export const parseSquareFootage = (sqftText) => {
  if (!sqftText) return 0;
  const match = sqftText.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
};

export const formatAddress = (address) => {
  if (!address) return '';
  return address.trim().replace(/\s+/g, ' ');
};

export const generatePropertyId = (address, mlsNumber) => {
  const cleanAddress = address.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const cleanMls = mlsNumber ? mlsNumber.replace(/[^a-zA-Z0-9]/g, '') : '';
  return `${cleanAddress}_${cleanMls}`.substring(0, 50);
};
