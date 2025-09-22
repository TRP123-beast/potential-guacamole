import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import axios from "axios";
import { createNotification, hasNotification, getProperty, updateProperty, createPriceChange } from "../ReadAndSaveData.js";
import { readPropertyDetails } from "../property-scraper/ReadPropertyDetails.js";

puppeteer.use(StealthPlugin());
configDotenv();

export const checkPriceChanges = async (globalBrowser, propertyIds = []) => {
  let browser = globalBrowser;
  
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
        "--remote-debugging-port=9228"
      ],
    });
  }
  
  console.log("Started listening for price changes...");
  
  setInterval(async () => {
    try {
      console.log("Checking for price changes...");
      
      // Check each property for price changes
      for (const propertyId of propertyIds) {
        const existingProperty = await getProperty(propertyId);
        
        if (existingProperty) {
          // Get current property details
          const currentDetails = await readPropertyDetails(browser, existingProperty.url);
          
          if (currentDetails && currentDetails.price !== existingProperty.price) {
            const priceChange = {
              property_id: propertyId,
              old_price: existingProperty.price,
              new_price: currentDetails.price,
              change_amount: currentDetails.price - existingProperty.price,
              change_percentage: ((currentDetails.price - existingProperty.price) / existingProperty.price) * 100,
              timestamp: new Date().toISOString()
            };
            
            // Record the price change
            await createPriceChange(priceChange);
            
            // Update the property
            await updateProperty({
              ...existingProperty,
              price: currentDetails.price,
              price_change: priceChange.change_amount,
              last_updated: new Date().toISOString()
            });
            
            // Create notification
            const notificationType = priceChange.change_amount > 0 ? 'price_increase' : 'price_drop';
            const changeText = priceChange.change_amount > 0 ? 'increased' : 'decreased';
            
            await createNotification({
              property_id: propertyId,
              notification_type: notificationType,
              content: `Price ${changeText} from $${existingProperty.price.toLocaleString()} to $${currentDetails.price.toLocaleString()} (${priceChange.change_percentage.toFixed(2)}%)`,
              timestamp: Date.now()
            });
            
            console.log(`Price change detected for ${existingProperty.address}: ${changeText} by $${Math.abs(priceChange.change_amount).toLocaleString()}`);
            
            // Send notification to external service if configured
            try {
              await axios.post(
                "http://localhost:3000/notifications/price-change",
                {
                  property_id: propertyId,
                  address: existingProperty.address,
                  old_price: existingProperty.price,
                  new_price: currentDetails.price,
                  change_amount: priceChange.change_amount,
                  change_percentage: priceChange.change_percentage
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
      console.error("Error checking for price changes:", error);
    }
  }, 600000); // Check every 10 minutes
};
