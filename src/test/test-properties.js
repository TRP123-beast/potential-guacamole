import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs/promises";
import { readPropertyListings } from "../property-scraper/ReadPropertyListings.js";
import { readPropertyDetails } from "../property-scraper/ReadPropertyDetails.js";
import { readShowingSchedules } from "../property-scraper/ReadShowingSchedules.js";
import { createProperty } from "../ReadAndSaveData.js";
import { writeToAFile } from "../utils.js";

puppeteer.use(StealthPlugin());
configDotenv();

export const testSpecificProperties = async () => {
  const testAddresses = [
    "101 Lake Drive N",
    "10 Navy Wharf Court #3209"
  ];

  let browser;
  let results = [];

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
        "--remote-debugging-port=9223"
      ],
    });

    console.log("Testing Broker Bay property scraping...");

    for (const address of testAddresses) {
      console.log(`\n=== Testing address: ${address} ===`);
      
      try {
        // Step 1: Search for properties
        console.log("1. Searching for properties...");
        const listings = await readPropertyListings(browser, address);
        console.log(`Found ${listings.length} listings for ${address}`);
        
        if (listings.length > 0) {
          // Step 2: Get detailed information for each property
          for (let i = 0; i < listings.length; i++) {
            const listing = listings[i];
            console.log(`\n2. Getting details for property ${i + 1}: ${listing.address}`);
            
            if (listing.url) {
              const details = await readPropertyDetails(browser, listing.url);
              if (details) {
                const fullProperty = { ...listing, ...details };
                
                // Step 3: Get showing schedules
                console.log("3. Getting showing schedules...");
                const schedules = await readShowingSchedules(browser, listing.url);
                
                const propertyResult = {
                  ...fullProperty,
                  showingSchedules: schedules,
                  scrapedAt: new Date().toISOString()
                };
                
                results.push(propertyResult);
                
                // Save to database
                try {
                  await createProperty(fullProperty);
                  console.log(`✓ Property saved to database: ${fullProperty.address}`);
                } catch (error) {
                  console.log(`✗ Error saving property: ${error.message}`);
                }
                
                console.log(`✓ Property details scraped successfully`);
                console.log(`  - Address: ${fullProperty.address}`);
                console.log(`  - Price: $${fullProperty.price?.toLocaleString() || 'N/A'}`);
                console.log(`  - Bedrooms: ${fullProperty.bedrooms || 'N/A'}`);
                console.log(`  - Bathrooms: ${fullProperty.bathrooms || 'N/A'}`);
                console.log(`  - Sqft: ${fullProperty.sqft || 'N/A'}`);
                console.log(`  - MLS: ${fullProperty.mls_number || 'N/A'}`);
                console.log(`  - Agent: ${fullProperty.agent || 'N/A'}`);
                console.log(`  - URL: ${fullProperty.url}`);
                
                if (schedules && schedules.timeSlots) {
                  console.log(`  - Available time slots: ${schedules.timeSlots.length}`);
                }
              } else {
                console.log(`✗ Could not get details for ${listing.address}`);
              }
            } else {
              console.log(`✗ No URL found for ${listing.address}`);
            }
          }
        } else {
          console.log(`No listings found for ${address}`);
        }
        
      } catch (error) {
        console.log(`✗ Error processing ${address}: ${error.message}`);
      }
    }

    // Save results to file
    await writeToAFile(results, "src/data/test-properties-results.json");
    console.log(`\n=== Test completed ==`);
    console.log(`Total properties processed: ${results.length}`);
    console.log(`Results saved to: src/data/test-properties-results.json`);

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return results;
};

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testSpecificProperties().then(() => {
    console.log("Test completed");
    process.exit(0);
  }).catch(error => {
    console.error("Test failed:", error);
    process.exit(1);
  });
}
