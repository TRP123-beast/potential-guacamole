import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { waitFor, parsePrice, parseSquareFootage, formatAddress, generatePropertyId, loginAndSearch } from "../utils.js";

puppeteer.use(StealthPlugin());
configDotenv();

export const readPropertyListings = async (globalBrowser, searchAddress = null) => {
  let properties = [];
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
        "--remote-debugging-port=9224"
      ],
    });
  }

  const page = await browser.newPage();
  
  try {
    // If specific address provided, use loginAndSearch function
    if (searchAddress) {
      console.log(`🔍 Starting login and search for: ${searchAddress}`);
      const searchSuccess = await loginAndSearch(page, searchAddress);
      if (!searchSuccess) {
        console.log("❌ Failed to login and search");
        return [];
      }
    } else {
      // Navigate to Broker Bay dashboard
      await page.goto("https://edge.brokerbay.com/#/my_business");
      await waitFor(5000);
    }

    // Wait for property listings to load - try multiple selectors
    const propertySelectors = [
      '[data-testid="property-card"]',
      '.property-card',
      '.listing-card',
      '[class*="property"]',
      '[class*="listing"]',
      '.property-item',
      '.listing-item',
      '.card',
      '.property',
      '.listing',
      '[data-testid="listing"]',
      '[data-testid="property"]'
    ];
    
    let propertyElements = null;
    for (const selector of propertySelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        propertyElements = await page.$$(selector);
        if (propertyElements.length > 0) {
          console.log(`Found ${propertyElements.length} properties with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (!propertyElements || propertyElements.length === 0) {
      console.log("No property listings found on the page");
      return [];
    }

    // Extract property data
    properties = await page.$$eval(propertySelectors.join(', '), (items) => {
      return items.map((item, index) => {
        // Try multiple selectors for different data points
        const getTextContent = (selectors) => {
          for (const selector of selectors) {
            const element = item.querySelector(selector);
            if (element && element.textContent.trim()) {
              return element.textContent.trim();
            }
          }
          return '';
        };

        const getHref = (selectors) => {
          for (const selector of selectors) {
            const element = item.querySelector(selector);
            if (element && element.href) {
              return element.href;
            }
          }
          return '';
        };

        const address = getTextContent([
          '[data-testid="address"]',
          '.address',
          '.property-address',
          'h2', 'h3', 'h4',
          '[class*="address"]',
          'a[href*="/property/"]'
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

        const propertyUrl = getHref([
          'a[href*="/property/"]',
          'a[href*="/listing/"]',
          'a'
        ]);

        const agent = getTextContent([
          '[data-testid="agent"]',
          '.agent',
          '.listing-agent',
          '[class*="agent"]'
        ]);

        return {
          property_id: `bb_${index}_${Date.now()}`,
          address: address,
          price: price,
          bedrooms: bedrooms,
          bathrooms: bathrooms,
          sqft: sqft,
          mls_number: mlsNumber,
          agent: agent,
          url: propertyUrl,
          listing_date: new Date().toISOString(),
          last_updated: new Date().toISOString(),
          status: 'Active',
          property_type: 'Residential',
          features: '',
          description: ''
        };
      }).filter(property => property.address && property.price);
    });

    console.log(`Found ${properties.length} properties`);

    // Process and clean the data
    properties = properties.map(property => ({
      ...property,
      property_id: generatePropertyId(property.address, property.mls_number),
      price: parsePrice(property.price),
      bedrooms: parseInt(property.bedrooms) || 0,
      bathrooms: parseInt(property.bathrooms) || 0,
      sqft: parseSquareFootage(property.sqft),
      address: formatAddress(property.address)
    }));

  } catch (error) {
    console.log("Error scraping property listings:", error);
  }

  shouldClose ? await browser.close() : await page.close();
  return properties;
};
