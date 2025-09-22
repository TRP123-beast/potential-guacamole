import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import axios from "axios";
import { createNotification, hasNotification } from "../ReadAndSaveData.js";
import { readPropertyListings } from "../property-scraper/ReadPropertyListings.js";

puppeteer.use(StealthPlugin());
configDotenv();

export const checkNewListings = async (globalBrowser) => {
  let browser = globalBrowser;
  let retriesTracker = 0;
  
  try {
    const pages = await browser.pages();
    if (pages.length === 0) throw new Error();
  } catch {
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
        "--remote-debugging-port=9227"
      ],
    });
  }
  
  console.log("Started listening for new property listings...");
  
  setInterval(async () => {
    try {
      console.log("Checking for new listings...");
      
      // Scrape current listings
      const currentListings = await readPropertyListings(browser);
      
      if (currentListings && currentListings.length > 0) {
        // Check each listing for new properties
        for (const listing of currentListings) {
          const notificationId = `${listing.property_id}_new_listing_${Date.now()}`;
          
          if (!(await hasNotification(listing.property_id, 'new_listing', Date.now()))) {
            await createNotification({
              property_id: listing.property_id,
              notification_type: 'new_listing',
              content: `New listing found: ${listing.address} - $${listing.price.toLocaleString()}`,
              timestamp: Date.now()
            });
            
            console.log(`New listing detected: ${listing.address}`);
            
            // Send notification to external service if configured
            try {
              await axios.post(
                "http://localhost:3000/notifications/new-listing",
                {
                  property_id: listing.property_id,
                  address: listing.address,
                  price: listing.price
                },
                {
                  headers: { "Content-Type": "application/json" },
                }
              );
            } catch (err) {
              console.error(`Forward error: ${err.code}`, err.message);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error checking for new listings:", error);
    }
  }, 300000); // Check every 5 minutes
};
