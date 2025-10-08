import { readPropertyDetails } from "./ReadPropertyDetails.js";
import { scrapeShowingPage } from "./ScrapeShowingPage.js";
import { createProperty, createShowingAppointment } from "../ReadAndSaveData.js";
import { waitFor, writeToAFile, extractPropertyId, generatePropertyId } from "../utils.js";
import path from "path";
import fs from "fs/promises";

export const manualApiSearchAndScrape = async (page, browser, searchQuery) => {
  let propertyData = null;
  let appointmentData = null;

  try {
    console.log("🔍 Using manual API search approach...");
    
    // Get the current page's cookies and headers for API calls
    const cookies = await page.cookies();
    const userAgent = await page.evaluate(() => navigator.userAgent);
    
    // Construct the search API URL
    const searchUrl = `https://edge.brokerbay.com/search/listings?input=${encodeURIComponent(searchQuery)}&crossOrg=true`;
    console.log(`🌐 Calling search API: ${searchUrl}`);
    
    // Make the API call using page.evaluate to use the browser's context
    const searchResults = await page.evaluate(async (url) => {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        return { success: true, data: data };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }, searchUrl);
    
    if (!searchResults.success) {
      console.log(`❌ API call failed: ${searchResults.error}`);
      return null;
    }
    
    const results = searchResults.data;
    console.log(`✅ Search API response received: ${results.length || 0} results found`);
    
    if (!results || results.length === 0) {
      console.log("❌ No search results found in API response");
      return null;
    }
    
    // Use the first search result
    const firstResult = results[0];
    console.log(`✅ Using first search result: ${firstResult.address || firstResult.title || 'Unknown'}`);
    console.log(`📋 First result details: ${JSON.stringify(firstResult, null, 2)}`);
    
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
    console.log("❌ manualApiSearchAndScrape error:", error.message);
    return null;
  }
};
