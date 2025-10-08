import { readPropertyDetails } from "./ReadPropertyDetails.js";
import { scrapeShowingPage } from "./ScrapeShowingPage.js";
import { createProperty, createShowingAppointment } from "../ReadAndSaveData.js";
import { waitFor, writeToAFile, extractPropertyId, generatePropertyId } from "../utils.js";
import path from "path";
import fs from "fs/promises";

export const directApiSearchAndScrape = async (page, browser, searchQuery) => {
  let propertyData = null;
  let appointmentData = null;
  let propertyUrl = null;

  try {
    console.log("🔍 Using direct API search approach...");
    
    // Intercept the search API response
    let searchResults = null;
    
    const responseHandler = async (response) => {
      if (response.url().includes('/search/listings') && response.status() === 200) {
        try {
          searchResults = await response.json();
          console.log(`✅ Search API response intercepted: ${searchResults.length || 0} results found`);
          
          if (searchResults && searchResults.length > 0) {
            console.log(`📋 First result: ${JSON.stringify(searchResults[0], null, 2)}`);
          }
        } catch (e) {
          console.log("❌ Failed to parse search API response:", e.message);
        }
      }
    };
    
    page.on('response', responseHandler);
    
    // Perform the search
    console.log("🔍 Performing search...");
    const searchInput = await page.$('input[placeholder*="Search listings or agents"]');
    if (!searchInput) {
      console.log("❌ Search input not found");
      return null;
    }
    
    await searchInput.click({ clickCount: 3 });
    await searchInput.evaluate(el => {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await searchInput.type(searchQuery, { delay: 50 });
    await page.keyboard.press('Enter');
    
    // Wait for API response
    console.log("⏳ Waiting for search API response...");
    await waitFor(5000);
    
    // Remove the response handler
    page.off('response', responseHandler);
    
    if (!searchResults || searchResults.length === 0) {
      console.log("❌ No search results found in API response");
      return null;
    }
    
    // Use the first search result
    const firstResult = searchResults[0];
    console.log(`✅ Using first search result: ${firstResult.address || firstResult.title || 'Unknown'}`);
    
    // Extract property information from API response
    const propertyId = firstResult.id || firstResult.listingId || generatePropertyId();
    const address = firstResult.address || firstResult.title || searchQuery;
    const price = firstResult.price || firstResult.listPrice || 0;
    const bedrooms = firstResult.bedrooms || firstResult.beds || 0;
    const bathrooms = firstResult.bathrooms || firstResult.baths || 0;
    const sqft = firstResult.sqft || firstResult.squareFeet || 0;
    const mlsNumber = firstResult.mlsNumber || firstResult.mls || 'N/A';
    const agent = firstResult.agent || firstResult.listingAgent || 'N/A';
    const agentPhone = firstResult.agentPhone || firstResult.phone || 'N/A';
    const description = firstResult.description || firstResult.remarks || 'N/A';
    const features = firstResult.features || firstResult.amenities || 'N/A';
    const propertyType = firstResult.propertyType || firstResult.type || 'Unknown';
    const yearBuilt = firstResult.yearBuilt || firstResult.year || null;
    const lotSize = firstResult.lotSize || firstResult.lot || 'N/A';
    const parkingSpaces = firstResult.parkingSpaces || firstResult.parking || 0;
    const status = firstResult.status || firstResult.listingStatus || 'Active';
    
    // Create property data from API response
    propertyData = {
      property_id: propertyId,
      address: address,
      url: firstResult.url || firstResult.listingUrl || `https://edge.brokerbay.com/#/listing/${propertyId}`,
      price: price,
      bedrooms: bedrooms,
      bathrooms: bathrooms,
      sqft: sqft,
      mls_number: mlsNumber,
      agent: agent,
      agent_phone: agentPhone,
      description: description,
      features: features,
      property_type: propertyType,
      year_built: yearBuilt,
      lot_size: lotSize,
      parking_spaces: parkingSpaces,
      status: status,
      listing_date: firstResult.listingDate || new Date().toISOString(),
      last_updated: new Date().toISOString(),
      details_json: firstResult.details || {},
      rooms_json: firstResult.rooms || []
    };
    
    console.log(`✅ Property data extracted from API: ${propertyData.address}`);
    
    // Try to navigate to the property page for additional details
    if (firstResult.url || firstResult.listingUrl) {
      console.log("🌐 Navigating to property page for additional details...");
      try {
        await page.goto(firstResult.url || firstResult.listingUrl, { waitUntil: 'domcontentloaded' });
        await waitFor(3000);
        
        // Try to scrape additional details from the property page
        const additionalDetails = await readPropertyDetails(browser, page.url());
        if (additionalDetails) {
          // Merge additional details
          propertyData = { ...propertyData, ...additionalDetails };
          propertyData.property_id = propertyId; // Keep original ID
          propertyData.last_updated = new Date().toISOString();
          console.log("✅ Additional details scraped from property page");
        }
        
        // Check if this is an appointment page
        if (page.url().includes('/appointments/')) {
          console.log("📝 Scraping appointment details...");
          appointmentData = await scrapeShowingPage(page, propertyId);
          if (appointmentData) {
            appointmentData.appointment_url = page.url();
            appointmentData.property_id = propertyId;
            appointmentData.created_at = new Date().toISOString();
            appointmentData.updated_at = new Date().toISOString();
            console.log("✅ Appointment details scraped");
          }
        }
        
      } catch (navError) {
        console.log("⚠️ Could not navigate to property page:", navError.message);
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
    lines.push(`Property Type: ${propertyData.property_type}`);
    lines.push(`Year Built: ${propertyData.year_built || 'N/A'}`);
    lines.push(`Lot Size: ${propertyData.lot_size}`);
    lines.push(`Parking Spaces: ${propertyData.parking_spaces}`);
    lines.push(`Status: ${propertyData.status}`);
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
    
  } catch (error) {
    console.log("❌ directApiSearchAndScrape error:", error.message);
    return null;
  }
};
