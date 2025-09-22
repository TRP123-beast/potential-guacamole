import express from "express";
import util from "util";
import { readPropertyListings } from "./property-scraper/ReadPropertyListings.js";
import { readPropertyDetails } from "./property-scraper/ReadPropertyDetails.js";
import { readShowingSchedules, bookShowing } from "./property-scraper/ReadShowingSchedules.js";
import { createProperty, getAllProperties, getProperty, getPropertiesByAddress, updateProperty } from "./ReadAndSaveData.js";
import { createBrowserInstance } from "./utils.js";
import { checkNewListings } from "./property-monitors/ListenForNewListings.js";
import { checkPriceChanges } from "./property-monitors/ListenForPriceChanges.js";
const app = express();
let puppeteerBrowser;
//Main
app.get("/", async (req, res) => {
  res.send({
    success: true,
    message: "Broker Bay property scraper is running successfully",
  });
});

//Property Management
app.get("/properties", async (req, res) => {
  try {
    const properties = await getAllProperties();
    res.json({ success: true, data: properties });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/properties/:id", async (req, res) => {
  try {
    const property = await getProperty(req.params.id);
    if (property) {
      res.json({ success: true, data: property });
    } else {
      res.status(404).json({ success: false, message: "Property not found" });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/properties/search/:address", async (req, res) => {
  try {
    const properties = await getPropertiesByAddress(req.params.address);
    res.json({ success: true, data: properties });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

//Property Scraping
app.post("/properties/scrape", async (req, res) => {
  try {
    const { address } = req.body;
    const properties = await readPropertyListings(puppeteerBrowser, address);
    console.log("Scraped properties: " + JSON.stringify(properties, null, 2));

    const savedProperties = [];
    for (const property of properties) {
      const savedProperty = await createProperty(property);
      savedProperties.push(savedProperty);
    }

    res.json({ success: true, data: savedProperties, count: savedProperties.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/properties/details", async (req, res) => {
  try {
    const { url } = req.body;
    const propertyDetails = await readPropertyDetails(puppeteerBrowser, url);
    console.log("Property details: " + JSON.stringify(propertyDetails, null, 2));

    if (propertyDetails) {
      const savedProperty = await createProperty(propertyDetails);
      res.json({ success: true, data: savedProperty });
    } else {
      res.status(404).json({ success: false, message: "Property details not found" });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

//Showing Schedules
app.post("/properties/showing/schedule", async (req, res) => {
  try {
    const { url } = req.body;
    const schedules = await readShowingSchedules(puppeteerBrowser, url);
    console.log("Showing schedules: " + JSON.stringify(schedules, null, 2));
    res.json({ success: true, data: schedules });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/properties/showing/book", async (req, res) => {
  try {
    const { url, dateTime } = req.body;
    const bookingResult = await bookShowing(puppeteerBrowser, url, dateTime);
    console.log("Booking result: " + JSON.stringify(bookingResult, null, 2));
    res.json({ success: true, data: bookingResult });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

//Monitoring
app.post("/monitor/start", async (req, res) => {
  try {
    // Start monitoring for new listings and price changes
    // checkNewListings(puppeteerBrowser);
    // checkPriceChanges(puppeteerBrowser);
    res.json({ success: true, message: "Monitoring started" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/monitor/stop", async (req, res) => {
  try {
    // Stop monitoring
    res.json({ success: true, message: "Monitoring stopped" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen("3000", async () => {
  console.log("Broker Bay property scraper running on port 3000");

  if (!puppeteerBrowser) {
    puppeteerBrowser = await createBrowserInstance();
    console.log("Created browser successfully!");
  }
  //checkNewListings(puppeteerBrowser);
  //checkPriceChanges(puppeteerBrowser);
});
