import { readPropertyDetails } from "./ReadPropertyDetails.js";
import { scrapeShowingPage } from "./ScrapeShowingPage.js";
import { createProperty, createShowingAppointment } from "../ReadAndSaveData.js";
import { waitFor, writeToAFile, extractPropertyId, generatePropertyId } from "../utils.js";
import path from "path";
import fs from "fs/promises";

export const clickModalContentAndScrape = async (page, browser, searchQuery) => {
  let propertyData = null;
  let appointmentData = null;
  let propertyUrl = null;

  try {
    console.log("🔍 Looking for search result content containing the property address...");
    
    // Wait for the search results modal to appear and load content
    console.log("⏳ Waiting for search results to load...");
    await waitFor(5000);
    
    // Take a screenshot to see what's on the page
    await page.screenshot({ path: 'debug-modal-content.png', fullPage: true });
    console.log("📸 Debug screenshot saved as 'debug-modal-content.png'");
    
    // Look for modal containing the search query
    const modal = await page.$('[role="dialog"], .ant-modal, .ant-drawer');
    if (!modal) {
      console.log("❌ No search results modal found");
      return null;
    }
    
    console.log("✅ Search results modal found");
    
    // Get modal content for debugging
    const modalContent = await modal.evaluate(el => el.textContent);
    console.log(`📄 Modal content preview: "${modalContent.substring(0, 300)}..."`);
    
    // Look for content containing the search query
    const searchResult = await page.evaluate((query) => {
      // Look for any element containing the search query
      const allElements = document.querySelectorAll('*');
      for (const element of allElements) {
        const text = element.textContent.trim();
        if (text.includes(query) && text.length < 200) { // Reasonable length for a property listing
          return {
            found: true,
            text: text,
            tagName: element.tagName,
            className: element.className,
            isClickable: element.tagName === 'A' || element.tagName === 'BUTTON' || element.onclick || element.style.cursor === 'pointer'
          };
        }
      }
      return { found: false, text: '', tagName: '', className: '', isClickable: false };
    }, searchQuery);
    
    if (searchResult.found) {
      console.log(`✅ Found search result content: "${searchResult.text}"`);
      console.log(`   Element: ${searchResult.tagName} with classes: ${searchResult.className}`);
      console.log(`   Is clickable: ${searchResult.isClickable}`);
      
      // Find the actual element to click
      const allElements = await page.$$('*');
      let resultElement = null;
      
      for (const element of allElements) {
        const text = await element.evaluate(el => el.textContent.trim());
        if (text.includes(searchQuery) && text.length < 200) {
          resultElement = element;
          console.log(`✅ Found clickable element containing: "${text.substring(0, 50)}..."`);
          break;
        }
      }
      
      if (resultElement) {
        console.log("🖱️ Clicking on the search result content...");
        
        // Try to click the element
        try {
          await resultElement.click();
          console.log("✅ Successfully clicked on search result content");
          
          // Wait for navigation or page change
          await waitFor(3000);
          
          // Check if we navigated to a property page
          const currentUrl = page.url();
          console.log(`🌐 Current URL after click: ${currentUrl}`);
          
          // Check if URL contains property ID or appointment pattern
          if (currentUrl.includes('/listing/') || currentUrl.includes('/appointments/')) {
            console.log("✅ Successfully navigated to property/appointment page");
            propertyUrl = currentUrl;
          } else {
            console.log("⚠️ Navigation may not have occurred, checking for property details on current page");
          }
          
        } catch (clickError) {
          console.log("❌ Failed to click element:", clickError.message);
          
          // Try alternative clicking methods
          console.log("🔍 Trying alternative clicking methods...");
          
          try {
            // Method 1: Click with coordinates
            const box = await resultElement.boundingBox();
            if (box) {
              await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
              console.log("✅ Clicked using coordinates");
              await waitFor(3000);
            }
          } catch (coordError) {
            console.log("❌ Coordinate click failed:", coordError.message);
            
            // Method 2: JavaScript click
            try {
              await resultElement.evaluate(el => el.click());
              console.log("✅ Clicked using JavaScript");
              await waitFor(3000);
            } catch (jsError) {
              console.log("❌ JavaScript click failed:", jsError.message);
              return null;
            }
          }
        }
        
        // Check if we have a property URL now
        if (!propertyUrl) {
          propertyUrl = page.url();
        }
        
        const propertyId = extractPropertyId(propertyUrl) || generatePropertyId();
        
        // Scrape the current page for property details
        console.log("📝 Scraping property details from current page...");
        propertyData = await readPropertyDetails(browser, propertyUrl);
        
        if (!propertyData) {
          console.log("⚠️ Could not scrape full property details. Creating minimal property entry.");
          propertyData = {
            property_id: propertyId,
            address: searchQuery,
            url: propertyUrl,
            price: 0, bedrooms: 0, bathrooms: 0, sqft: 0,
            status: 'Unknown', listing_date: new Date().toISOString(), last_updated: new Date().toISOString(),
            mls_number: 'N/A', agent: 'N/A', agent_phone: 'N/A', description: 'N/A', features: 'N/A',
            property_type: 'Unknown', year_built: null, lot_size: 'N/A', parking_spaces: 0,
            details_json: {}, rooms_json: []
          };
        }
        
        propertyData.property_id = propertyId;
        propertyData.url = propertyUrl;
        propertyData.last_updated = new Date().toISOString();
        
        // Try to scrape appointment details if we're on an appointment page
        if (propertyUrl.includes('/appointments/')) {
          console.log("📝 Scraping appointment details...");
          appointmentData = await scrapeShowingPage(page, propertyId);
          if (appointmentData) {
            appointmentData.appointment_url = propertyUrl;
            appointmentData.property_id = propertyId;
            appointmentData.created_at = new Date().toISOString();
            appointmentData.updated_at = new Date().toISOString();
          }
        }
        
        // Persist to local SQLite
        console.log("💾 Saving data to database...");
        const savedProperty = createProperty(propertyData);
        let savedAppointment = null;
        
        if (appointmentData) {
          savedAppointment = createShowingAppointment(appointmentData);
        }
        
        // Write human-readable report
        const lines = [];
        lines.push(`--- Property Report for ${propertyData.address} ---`);
        lines.push(`Property ID: ${propertyData.property_id}`);
        lines.push(`Address: ${propertyData.address}`);
        lines.push(`Price: $${propertyData.price.toLocaleString()}`);
        lines.push(`Bedrooms: ${propertyData.bedrooms}`);
        lines.push(`Bathrooms: ${propertyData.bathrooms}`);
        lines.push(`Sqft: ${propertyData.sqft}`);
        lines.push(`MLS Number: ${propertyData.mls_number}`);
        lines.push(`Agent: ${propertyData.agent}`);
        lines.push(`URL: ${propertyData.url}`);
        lines.push(`Description: ${propertyData.description}`);
        lines.push(`Features: ${propertyData.features}`);
        lines.push(`Details JSON: ${JSON.stringify(propertyData.details_json, null, 2)}`);
        lines.push(`Rooms JSON: ${JSON.stringify(propertyData.rooms_json, null, 2)}`);
        
        if (appointmentData) {
          lines.push("");
          lines.push(`--- Showing Appointment Report ---`);
          lines.push(`Appointment ID: ${appointmentData.appointment_id}`);
          lines.push(`Property Address: ${appointmentData.property_address}`);
          lines.push(`Agent Name: ${appointmentData.agent_name}`);
          lines.push(`Agent Company: ${appointmentData.agent_company}`);
          lines.push(`Selected Date: ${appointmentData.selected_date}`);
          lines.push(`Selected Time: ${appointmentData.selected_time}`);
          lines.push(`Appointment URL: ${appointmentData.appointment_url}`);
          lines.push(`Notes: ${appointmentData.notes}`);
          lines.push(`Buyers Invited: ${appointmentData.buyers_invited}`);
        }
        
        const outDir = path.resolve("src/data");
        const outPath = path.join(outDir, "last-scrape.txt");
        await fs.mkdir(outDir, { recursive: true });
        await fs.writeFile(outPath, lines.join("\n"), "utf-8");
        console.log(`📝 Wrote human-readable report: ${outPath}`);
        
        return { property: savedProperty, appointment: savedAppointment };
        
      } else {
        console.log("❌ Could not find clickable element containing search query");
        return null;
      }
      
    } else {
      console.log("❌ No content found containing the search query");
      
      // Fallback: Look for any property listing in the modal
      console.log("🔍 Fallback: Looking for any property listing in modal...");
      
      // Look for common property listing patterns
      const propertyPatterns = [
        /[0-9]+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Place|Pl|Lane|Ln|Boulevard|Blvd)/i,
        /\$[0-9,]+/,
        /[0-9]+\s+bed/i,
        /[0-9]+\s+bath/i,
        /[0-9,]+\s+sq\s*ft/i
      ];
      
      for (const pattern of propertyPatterns) {
        if (pattern.test(modalContent)) {
          console.log(`✅ Found property pattern in modal content`);
          
          // Find the element containing this pattern
          const allElements = await page.$$('*');
          for (const element of allElements) {
            const text = await element.evaluate(el => el.textContent.trim());
            if (pattern.test(text) && text.length < 300) {
              console.log(`✅ Found property element: "${text.substring(0, 100)}..."`);
              
              // Try to click this element
              try {
                await element.click();
                console.log("✅ Successfully clicked on property element");
                await waitFor(3000);
                
                // Continue with scraping...
                const propertyUrl = page.url();
                const propertyId = extractPropertyId(propertyUrl) || generatePropertyId();
                
                // Create minimal property data
                const propertyData = {
                  property_id: propertyId,
                  address: text.split('\n')[0] || searchQuery,
                  url: propertyUrl,
                  price: 0, bedrooms: 0, bathrooms: 0, sqft: 0,
                  status: 'Unknown', listing_date: new Date().toISOString(), last_updated: new Date().toISOString(),
                  mls_number: 'N/A', agent: 'N/A', agent_phone: 'N/A', description: text, features: 'N/A',
                  property_type: 'Unknown', year_built: null, lot_size: 'N/A', parking_spaces: 0,
                  details_json: {}, rooms_json: []
                };
                
                const savedProperty = createProperty(propertyData);
                
                // Write report
                const lines = [];
                lines.push(`--- Property Report for ${propertyData.address} ---`);
                lines.push(`Property ID: ${propertyData.property_id}`);
                lines.push(`Address: ${propertyData.address}`);
                lines.push(`URL: ${propertyData.url}`);
                lines.push(`Description: ${propertyData.description}`);
                
                const outDir = path.resolve("src/data");
                const outPath = path.join(outDir, "last-scrape.txt");
                await fs.mkdir(outDir, { recursive: true });
                await fs.writeFile(outPath, lines.join("\n"), "utf-8");
                console.log(`📝 Wrote human-readable report: ${outPath}`);
                
                return { property: savedProperty, appointment: null };
                
              } catch (clickError) {
                console.log("❌ Failed to click property element:", clickError.message);
                continue;
              }
            }
          }
          break;
        }
      }
      
      console.log("❌ No property patterns found in modal content");
      return null;
    }
    
  } catch (error) {
    console.log("❌ clickModalContentAndScrape error:", error.message);
    return null;
  }
};
