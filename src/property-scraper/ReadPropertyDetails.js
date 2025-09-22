import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { waitFor, parsePrice, parseSquareFootage, formatAddress, extractPropertyId, checkLoginStatus, loginToBrokerBay } from "../utils.js";

puppeteer.use(StealthPlugin());
configDotenv();

export const readPropertyDetails = async (globalBrowser, propertyUrl) => {
  let propertyDetails = null;
  let shouldClose = false;
  let browser = globalBrowser;

  // Check browser
  try {
    const pages = await browser.pages();
    if (pages.length === 0) {
      throw new Error();
    }
  } catch (error) {
    shouldClose = true;
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
        "--remote-debugging-port=9225"
      ],
    });
  }

  const page = await browser.newPage();
  
  try {
    console.log(`Navigating to property: ${propertyUrl}`);
    await page.goto(propertyUrl);
    await waitFor(5000);

    // Check if we need to log in
    const isLoggedIn = await checkLoginStatus(page);
    
    if (!isLoggedIn) {
      console.log("🔐 Not logged in, attempting automated login...");
      const loginSuccess = await loginToBrokerBay(page);
      if (!loginSuccess) {
        console.log("❌ Failed to log in to Broker Bay");
        return null;
      }
      // Navigate back to property after login
      await page.goto(propertyUrl);
      await waitFor(3000);
    }

    // Wait for property details to load
    await page.waitForSelector('body', { timeout: 15000 });

    // Extract detailed property information
    propertyDetails = await page.evaluate(() => {
      const getTextContent = (selectors) => {
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent.trim()) {
            return element.textContent.trim();
          }
        }
        return '';
      };

      const getTextContentAll = (selectors) => {
        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            return Array.from(elements).map(el => el.textContent.trim()).join(' | ');
          }
        }
        return '';
      };

      const address = getTextContent([
        'h1',
        '[data-testid="address"]',
        '.address',
        '.property-address',
        '[class*="address"]'
      ]);

      const price = getTextContent([
        '[data-testid="price"]',
        '.price',
        '.property-price',
        '[class*="price"]',
        '[class*="cost"]'
      ]);

      const bedrooms = getTextContent([
        '[data-testid="bedrooms"]',
        '.bedrooms',
        '.beds',
        '[class*="bed"]'
      ]);

      const bathrooms = getTextContent([
        '[data-testid="bathrooms"]',
        '.bathrooms',
        '.baths',
        '[class*="bath"]'
      ]);

      const sqft = getTextContent([
        '[data-testid="sqft"]',
        '.sqft',
        '.square-feet',
        '[class*="sqft"]',
        '[class*="area"]'
      ]);

      const mlsNumber = getTextContent([
        '[data-testid="mls"]',
        '.mls',
        '.mls-number',
        '[class*="mls"]'
      ]);

      const agent = getTextContent([
        '[data-testid="agent"]',
        '.agent',
        '.listing-agent',
        '[class*="agent"]'
      ]);

      const agentPhone = getTextContent([
        '[data-testid="agent-phone"]',
        '.agent-phone',
        '.phone',
        '[class*="phone"]'
      ]);

      const description = getTextContent([
        '[data-testid="description"]',
        '.description',
        '.property-description',
        '[class*="description"]'
      ]);

      const features = getTextContentAll([
        '[data-testid="features"]',
        '.features',
        '.amenities',
        '[class*="feature"]',
        '[class*="amenity"]'
      ]);

      const propertyType = getTextContent([
        '[data-testid="property-type"]',
        '.property-type',
        '[class*="type"]'
      ]);

      const yearBuilt = getTextContent([
        '[data-testid="year-built"]',
        '.year-built',
        '[class*="year"]'
      ]);

      const lotSize = getTextContent([
        '[data-testid="lot-size"]',
        '.lot-size',
        '[class*="lot"]'
      ]);

      const parkingSpaces = getTextContent([
        '[data-testid="parking"]',
        '.parking',
        '[class*="parking"]'
      ]);

      const status = getTextContent([
        '[data-testid="status"]',
        '.status',
        '[class*="status"]'
      ]);

      return {
        address: address,
        price: price,
        bedrooms: bedrooms,
        bathrooms: bathrooms,
        sqft: sqft,
        mls_number: mlsNumber,
        agent: agent,
        agent_phone: agentPhone,
        description: description,
        features: features,
        property_type: propertyType || 'Residential',
        year_built: yearBuilt,
        lot_size: lotSize,
        parking_spaces: parkingSpaces,
        status: status || 'Active'
      };
    });

    // Process and clean the data
    if (propertyDetails) {
      propertyDetails = {
        ...propertyDetails,
        property_id: extractPropertyId(propertyUrl) || `bb_${Date.now()}`,
        price: parsePrice(propertyDetails.price),
        bedrooms: parseInt(propertyDetails.bedrooms) || 0,
        bathrooms: parseInt(propertyDetails.bathrooms) || 0,
        sqft: parseSquareFootage(propertyDetails.sqft),
        year_built: parseInt(propertyDetails.year_built) || null,
        parking_spaces: parseInt(propertyDetails.parking_spaces) || 0,
        address: formatAddress(propertyDetails.address),
        listing_date: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        url: propertyUrl
      };
    }

    console.log(`Property details extracted: ${propertyDetails ? 'Success' : 'Failed'}`);

  } catch (error) {
    console.log("Error scraping property details:", error);
  }

  shouldClose ? await browser.close() : await page.close();
  return propertyDetails;
};
