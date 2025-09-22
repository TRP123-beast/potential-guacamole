import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { waitFor } from "../utils.js";

puppeteer.use(StealthPlugin());
configDotenv();

export const readShowingSchedules = async (globalBrowser, propertyUrl) => {
  let showingSchedules = [];
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
        "--remote-debugging-port=9226"
      ],
    });
  }

  const page = await browser.newPage();
  
  try {
    console.log(`Navigating to property for showing schedule: ${propertyUrl}`);
    await page.goto(propertyUrl);
    await waitFor(5000);

    // Look for "Book Showing" button or similar
    const bookShowingButton = await page.waitForSelector(
      'button:contains("Book Showing"), button:contains("Schedule Showing"), [data-testid="book-showing"], [class*="showing"], [class*="book"]',
      { timeout: 10000 }
    ).catch(() => null);

    if (bookShowingButton) {
      console.log("Found Book Showing button, clicking...");
      await bookShowingButton.click();
      await waitFor(3000);

      // Wait for showing schedule modal or page to load
      await page.waitForSelector(
        '[data-testid="showing-schedule"], .showing-schedule, [class*="showing"], [class*="schedule"], .calendar, [class*="calendar"]',
        { timeout: 10000 }
      );

      // Extract showing schedule data
      showingSchedules = await page.evaluate(() => {
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
              return Array.from(elements).map(el => el.textContent.trim());
            }
          }
          return [];
        };

        // Look for available time slots
        const timeSlots = getTextContentAll([
          '[data-testid="time-slot"]',
          '.time-slot',
          '.available-time',
          '[class*="time"]',
          '[class*="slot"]'
        ]);

        // Look for dates
        const dates = getTextContentAll([
          '[data-testid="date"]',
          '.date',
          '.showing-date',
          '[class*="date"]'
        ]);

        // Look for showing types
        const showingTypes = getTextContentAll([
          '[data-testid="showing-type"]',
          '.showing-type',
          '[class*="type"]'
        ]);

        // Look for agent contact info
        const agentContact = getTextContent([
          '[data-testid="agent-contact"]',
          '.agent-contact',
          '[class*="contact"]'
        ]);

        // Look for special instructions
        const instructions = getTextContent([
          '[data-testid="instructions"]',
          '.instructions',
          '[class*="instruction"]'
        ]);

        return {
          timeSlots: timeSlots,
          dates: dates,
          showingTypes: showingTypes,
          agentContact: agentContact,
          instructions: instructions,
          lastUpdated: new Date().toISOString()
        };
      });

      console.log(`Found ${showingSchedules.timeSlots?.length || 0} time slots`);
    } else {
      console.log("No Book Showing button found on this property");
    }

  } catch (error) {
    console.log("Error reading showing schedules:", error);
  }

  shouldClose ? await browser.close() : await page.close();
  return showingSchedules;
};

export const bookShowing = async (globalBrowser, propertyUrl, selectedDateTime) => {
  let bookingResult = null;
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
        "--remote-debugging-port=9226"
      ],
    });
  }

  const page = await browser.newPage();
  
  try {
    console.log(`Booking showing for: ${propertyUrl} at ${selectedDateTime}`);
    await page.goto(propertyUrl);
    await waitFor(5000);

    // Click Book Showing button
    const bookShowingButton = await page.waitForSelector(
      'button:contains("Book Showing"), button:contains("Schedule Showing"), [data-testid="book-showing"]',
      { timeout: 10000 }
    );

    await bookShowingButton.click();
    await waitFor(3000);

    // Select the desired date/time
    const timeSlotButton = await page.waitForSelector(
      `button:contains("${selectedDateTime}"), [data-testid="time-slot"]:contains("${selectedDateTime}")`,
      { timeout: 10000 }
    );

    if (timeSlotButton) {
      await timeSlotButton.click();
      await waitFor(2000);

      // Fill out any required forms
      const nameInput = await page.waitForSelector('input[name="name"], input[placeholder*="name"]', { timeout: 5000 }).catch(() => null);
      if (nameInput) {
        await nameInput.type(process.env.CONTACT_NAME || 'Test User');
      }

      const emailInput = await page.waitForSelector('input[name="email"], input[type="email"]', { timeout: 5000 }).catch(() => null);
      if (emailInput) {
        await emailInput.type(process.env.CONTACT_EMAIL || 'test@example.com');
      }

      const phoneInput = await page.waitForSelector('input[name="phone"], input[type="tel"]', { timeout: 5000 }).catch(() => null);
      if (phoneInput) {
        await phoneInput.type(process.env.CONTACT_PHONE || '555-1234');
      }

      // Submit the booking
      const submitButton = await page.waitForSelector('button[type="submit"], button:contains("Submit"), button:contains("Book")', { timeout: 5000 });
      if (submitButton) {
        await submitButton.click();
        await waitFor(3000);

        bookingResult = {
          success: true,
          message: 'Showing booked successfully',
          dateTime: selectedDateTime,
          timestamp: new Date().toISOString()
        };
      }
    }

  } catch (error) {
    console.log("Error booking showing:", error);
    bookingResult = {
      success: false,
      message: error.message,
      timestamp: new Date().toISOString()
    };
  }

  shouldClose ? await browser.close() : await page.close();
  return bookingResult;
};
