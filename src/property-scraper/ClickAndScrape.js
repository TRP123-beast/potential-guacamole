import { configDotenv } from "dotenv";
import fs from "fs/promises";
import path from "path";
import { waitFor } from "../utils.js";
import { readPropertyDetails } from "./ReadPropertyDetails.js";
import { createProperty, createShowingAppointment } from "../ReadAndSaveData.js";
import { scrapeShowingPage } from "./ScrapeShowingPage.js";

configDotenv();

// Click the "Book Showing" or "Request Showing" button and scrape the appointment page
export async function clickFirstResultAndScrape(page, browser, searchQuery) {
  try {
    // Ensure the dashboard search modal is open and focused
    try {
      const openBtnSel = '[data-cy="open-search-button"]';
      const alreadyOpen = await page.$('[role="dialog"], .ant-modal, .ant-drawer');
      if (!alreadyOpen) {
        const openBtn = await page.$(openBtnSel);
        if (openBtn) {
          await openBtn.click();
          await waitFor(300);
        }
      }
    } catch (_) {}

    // Focus search input inside modal if present; otherwise use right-most search input
    let inputHandle = await page.$('[role="dialog"] input, .ant-modal input, .ant-drawer input');
    if (!inputHandle) {
      // fallback to any visible input on page (right search bar heuristic)
      const allInputs = await page.$$('input');
      for (const handle of allInputs) {
        const box = await handle.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
          inputHandle = handle;
        }
      }
    }

    if (inputHandle && searchQuery) {
      await inputHandle.click({ clickCount: 3 });
      await inputHandle.evaluate((el) => {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await inputHandle.type(searchQuery, { delay: 20 });
      console.log("⏳ Waiting for search results to load dynamically...");
      await waitFor(3000); // Increased wait time for dynamic content
    }

    // Wait specifically for the search results modal to appear and load
    console.log("🔍 Waiting for search results modal to appear...");
    try {
      await page.waitForSelector('[role="dialog"], .ant-modal, .ant-drawer', { timeout: 8000 });
      console.log("✅ Search results modal detected");
      
      // Wait for the actual search results to load inside the modal
      await page.waitForFunction(() => {
        const modal = document.querySelector('[role="dialog"], .ant-modal, .ant-drawer');
        if (!modal) return false;
        
        // Look for property listings or buttons inside the modal
        const hasListings = modal.querySelector('.ant-list-item, [class*="list"] [class*="item"], [class*="result"]');
        const hasButtons = modal.querySelector('button, a');
        return hasListings || hasButtons;
      }, { timeout: 10000 });
      
      console.log("✅ Search results content loaded");
    } catch (error) {
      console.log("⚠️ Search results modal not detected, proceeding anyway...");
    }

    console.log("🔍 Looking for 'Book Showing' or 'Request Showing' buttons...");
    
    // Strategy 1: Look for "Book Showing" button
    let showingButton = null;
    let buttonText = '';
    
    try {
      // Debug: Take a screenshot to see what's on the page
      await page.screenshot({ path: 'debug-search-results.png', fullPage: true });
      console.log("📸 Debug screenshot saved as 'debug-search-results.png'");
      
      // Debug: Log all buttons on the page
      const allButtons = await page.$$('button, a');
      console.log(`🔍 Found ${allButtons.length} buttons/links on the page`);
      
      for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
        const button = allButtons[i];
        const text = await button.evaluate(el => el.textContent.trim());
        const classes = await button.evaluate(el => el.className);
        console.log(`  Button ${i + 1}: "${text}" (classes: ${classes})`);
      }
      
      // Look for "Book Showing" button using JavaScript evaluation
      const bookShowingResult = await page.evaluate(() => {
        const allButtons = document.querySelectorAll('button, a');
        for (const button of allButtons) {
          const text = button.textContent.trim();
          if (text.includes('Book Showing')) {
            return { found: true, text: text };
          }
        }
        return { found: false, text: '' };
      });
      
      if (bookShowingResult.found) {
        // Find the actual button element
        const allButtons = await page.$$('button, a');
        for (const button of allButtons) {
          const text = await button.evaluate(el => el.textContent.trim());
          if (text.includes('Book Showing')) {
            showingButton = button;
            buttonText = text;
            console.log(`✅ Found "Book Showing" button with text: "${text}"`);
            break;
          }
        }
      }
      
      // If "Book Showing" not found, look for "Request Showing"
      if (!showingButton) {
        const requestShowingResult = await page.evaluate(() => {
          const allButtons = document.querySelectorAll('button, a');
          for (const button of allButtons) {
            const text = button.textContent.trim();
            if (text.includes('Request Showing')) {
              return { found: true, text: text };
            }
          }
          return { found: false, text: '' };
        });
        
        if (requestShowingResult.found) {
          // Find the actual button element
          const allButtons = await page.$$('button, a');
          for (const button of allButtons) {
            const text = await button.evaluate(el => el.textContent.trim());
            if (text.includes('Request Showing')) {
              showingButton = button;
              buttonText = text;
              console.log(`✅ Found "Request Showing" button with text: "${text}"`);
              break;
            }
          }
        }
      }
      
      // Strategy 2: Look for any blue button in the search results
      if (!showingButton) {
        console.log("🔍 Looking for blue buttons in search results...");
        const blueButtons = await page.$$('button[style*="blue"], a[style*="blue"], .ant-btn-primary, button.blue, a.blue');
        
        for (const button of blueButtons) {
          const text = await button.evaluate(el => el.textContent.trim());
          if (text && (text.includes('Book') || text.includes('Showing') || text.includes('Request'))) {
            showingButton = button;
            buttonText = text;
            console.log(`✅ Found blue button with text: "${text}"`);
            break;
          }
        }
      }
      
      // Strategy 3: Look for buttons containing "Showing" in any form
      if (!showingButton) {
        console.log("🔍 Looking for any button containing 'Showing'...");
        const allButtons = await page.$$('button, a');
        
        for (const button of allButtons) {
          const text = await button.evaluate(el => el.textContent.trim());
          if (text && text.toLowerCase().includes('showing')) {
            showingButton = button;
            buttonText = text;
            console.log(`✅ Found button with text: "${text}"`);
            break;
          }
        }
      }
      
      // Strategy 4: Look for any blue button (as shown in your screenshot)
      if (!showingButton) {
        console.log("🔍 Looking for blue buttons (as shown in screenshot)...");
        const blueButtons = await page.$$('button.ant-btn-primary, button[class*="primary"], button[style*="blue"], .ant-btn-primary');
        
        for (const button of blueButtons) {
          const text = await button.evaluate(el => el.textContent.trim());
          const isVisible = await button.evaluate(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0;
          });
          
          if (isVisible && text) {
            console.log(`🔍 Blue button found: "${text}"`);
            if (text.toLowerCase().includes('book') || text.toLowerCase().includes('showing') || text.toLowerCase().includes('request')) {
              showingButton = button;
              buttonText = text;
              console.log(`✅ Selected blue button with text: "${text}"`);
              break;
            }
          }
        }
      }
      
      // Strategy 5: Look for any clickable element in the search results modal
      if (!showingButton) {
        console.log("🔍 Looking for any clickable element in search results...");
        const modal = await page.$('[role="dialog"], .ant-modal, .ant-drawer');
        if (modal) {
          const modalButtons = await modal.$$('button, a, [role="button"]');
          console.log(`🔍 Found ${modalButtons.length} clickable elements in modal`);
          
          for (const button of modalButtons) {
            const text = await button.evaluate(el => el.textContent.trim());
            const isVisible = await button.evaluate(el => {
              const style = window.getComputedStyle(el);
              return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0;
            });
            
            if (isVisible && text) {
              console.log(`🔍 Modal element: "${text}"`);
              if (text.toLowerCase().includes('book') || text.toLowerCase().includes('showing') || text.toLowerCase().includes('request')) {
                showingButton = button;
                buttonText = text;
                console.log(`✅ Selected modal element with text: "${text}"`);
                break;
              }
            }
          }
        }
      }
      
    } catch (error) {
      console.log("⚠️ Error finding showing buttons:", error.message);
    }

    if (!showingButton) {
      console.log("❌ No 'Book Showing' or 'Request Showing' button found");
      return null;
    }

    // Click the showing button
    console.log(`🖱️ Clicking "${buttonText}" button...`);
    const previousUrl = page.url();
    
    try {
      await showingButton.click();
      console.log(`✅ Successfully clicked "${buttonText}" button`);
    } catch (error) {
      console.log("⚠️ Direct click failed, trying coordinate click...");
      const box = await showingButton.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        console.log(`✅ Successfully clicked "${buttonText}" button via coordinates`);
      } else {
        throw new Error("Could not click showing button");
      }
    }

    // Wait for navigation to appointment page
    console.log("⏳ Waiting for navigation to appointment page...");
    
    try {
      // Wait for URL to change to appointment format
      await page.waitForFunction(
        (prevUrl) => {
          const currentUrl = window.location.href;
          return currentUrl !== prevUrl && 
                 currentUrl.includes('/appointments/book') && 
                 currentUrl.includes('/listing/');
        },
        { timeout: 10000 },
        previousUrl
      );
      
      const newUrl = page.url();
      console.log(`✅ Successfully navigated to appointment page: ${newUrl}`);
      
      // Extract property ID from URL
      const propertyIdMatch = newUrl.match(/\/listing\/([a-f0-9]+)\/appointments/);
      const propertyId = propertyIdMatch ? propertyIdMatch[1] : `prop_${Date.now()}`;
      
      // Extract property address from the page
      const propertyAddress = await page.evaluate(() => {
        const addressSelectors = [
          'h1',
          'h2',
          '.property-address',
          '[class*="address"]',
          '[data-testid*="address"]'
        ];
        
        for (const selector of addressSelectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent.trim()) {
            return element.textContent.trim();
          }
        }
        return '';
      });
      
      console.log(`🏠 Property Address: ${propertyAddress}`);
      console.log(`🆔 Property ID: ${propertyId}`);
      
      // Scrape the showing/appointment page
      const appointmentData = await scrapeShowingPage(page, propertyId, propertyAddress);
      
      if (appointmentData) {
        // Save appointment data to database
        const savedAppointment = createShowingAppointment(appointmentData);
        console.log("💾 Appointment data saved to database");
        
        // Now proceed to scrape the main property details
        console.log("🏠 Proceeding to scrape main property details...");
        const propertyDetails = await readPropertyDetails(browser, newUrl);
        
        if (propertyDetails) {
          // Update property details with the correct property ID and URL
          propertyDetails.property_id = propertyId;
          propertyDetails.url = newUrl;
          propertyDetails.address = propertyAddress || propertyDetails.address;
          
          // Save property details to database
          const savedProperty = createProperty(propertyDetails);
          console.log("💾 Property details saved to database");
          
          // Write human-readable report
          await writeReport(savedProperty, savedAppointment);
          
          return {
            property: savedProperty,
            appointment: savedAppointment
          };
        } else {
          console.log("⚠️ Failed to scrape property details, but appointment data was saved");
          return {
            property: null,
            appointment: savedAppointment
          };
        }
      } else {
        console.log("❌ Failed to scrape appointment page");
        return null;
      }
      
    } catch (error) {
      console.log("❌ Navigation to appointment page failed:", error.message);
      console.log(`Current URL: ${page.url()}`);
      console.log("Expected URL format: https://edge.brokerbay.com/#/listing/[ID]/appointments/book");
      return null;
    }

  } catch (error) {
    console.log("❌ clickFirstResultAndScrape error:", error.message);
    return null;
  }
}

// Write a comprehensive report including both property and appointment data
async function writeReport(property, appointment) {
  try {
    const lines = [];
    
    // Header
    lines.push(`# Property & Showing Report`);
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push(``);
    
    // Property Information
    if (property) {
      lines.push(`## Property Information`);
      lines.push(`Address: ${property.address}`);
      lines.push(`Price: $${property.price?.toLocaleString() || 'N/A'}`);
      lines.push(`Bedrooms: ${property.bedrooms}`);
      lines.push(`Bathrooms: ${property.bathrooms}`);
      lines.push(`SqFt: ${property.sqft?.toLocaleString() || 'N/A'}`);
      lines.push(`MLS: ${property.mls_number || 'N/A'}`);
      lines.push(`Status: ${property.status}`);
      lines.push(`Type: ${property.property_type}`);
      lines.push(`Agent: ${property.agent || 'N/A'}`);
      lines.push(`Agent Phone: ${property.agent_phone || 'N/A'}`);
      lines.push(`Year Built: ${property.year_built || 'N/A'}`);
      lines.push(`Lot Size: ${property.lot_size || 'N/A'}`);
      lines.push(`Parking Spaces: ${property.parking_spaces || 'N/A'}`);
      lines.push(`URL: ${property.url}`);
      lines.push(``);
      
      if (property.description) {
        lines.push(`### Description`);
        lines.push(property.description);
        lines.push(``);
      }
    }
    
    // Appointment Information
    if (appointment) {
      lines.push(`## Showing Appointment Information`);
      lines.push(`Appointment ID: ${appointment.appointment_id}`);
      lines.push(`Property Address: ${appointment.property_address}`);
      lines.push(`Agent Name: ${appointment.agent_name || 'N/A'}`);
      lines.push(`Agent Company: ${appointment.agent_company || 'N/A'}`);
      lines.push(`Agent Address: ${appointment.agent_address || 'N/A'}`);
      lines.push(`Agent Email: ${appointment.agent_email || 'N/A'}`);
      lines.push(`Showing Type: ${appointment.showing_type}`);
      lines.push(`Selected Date: ${appointment.selected_date || 'N/A'}`);
      lines.push(`Selected Time: ${appointment.selected_time || 'N/A'}`);
      lines.push(`Timezone: ${appointment.timezone}`);
      lines.push(`Status: ${appointment.status}`);
      lines.push(`Notes: ${appointment.notes || 'None'}`);
      lines.push(`Buyers Invited: ${appointment.buyers_invited || 'None'}`);
      lines.push(`Appointment URL: ${appointment.appointment_url}`);
      lines.push(``);
    }
    
    // Database Information
    lines.push(`## Database Information`);
    lines.push(`Property ID: ${property?.property_id || 'N/A'}`);
    lines.push(`Appointment ID: ${appointment?.appointment_id || 'N/A'}`);
    lines.push(`Created: ${new Date().toLocaleString()}`);
    lines.push(`Database: src/data/data.db`);
    
    // Write to file
    const outDir = path.resolve("src/data");
    const outPath = path.join(outDir, "last-scrape.txt");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(outPath, lines.join("\n"), "utf-8");
    console.log(`📝 Comprehensive report written to: ${outPath}`);
    
  } catch (error) {
    console.log("❌ Error writing report:", error.message);
  }
}

export default clickFirstResultAndScrape;