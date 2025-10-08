import { configDotenv } from "dotenv";
import { waitFor } from "../utils.js";

configDotenv();

// Scrape the showing/appointment booking page
export const scrapeShowingPage = async (page, propertyId, propertyAddress) => {
  try {
    console.log("📅 Scraping showing/appointment page...");
    
    // Wait for the page to load completely
    await waitFor(3000);
    
    // Extract appointment data from the showing page
    const appointmentData = await page.evaluate(() => {
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
            return Array.from(elements).map(el => el.textContent.trim()).join(' | ');
          }
        }
        return '';
      };

      // Extract agent information
      const agentName = getTextContent([
        '[data-testid="agent-name"]',
        '.agent-name',
        'h1',
        'h2',
        '.profile-name',
        '[class*="agent"] [class*="name"]'
      ]);

      const agentCompany = getTextContent([
        '[data-testid="agent-company"]',
        '.agent-company',
        '.company-name',
        '[class*="company"]'
      ]);

      const agentAddress = getTextContent([
        '[data-testid="agent-address"]',
        '.agent-address',
        '.address',
        '[class*="address"]'
      ]);

      const agentEmail = getTextContent([
        '[data-testid="agent-email"]',
        '.agent-email',
        'a[href^="mailto:"]',
        '[class*="email"]'
      ]);

      // Extract showing type
      const showingType = getTextContent([
        '[data-testid="showing-type"]',
        '.showing-type',
        'select option:checked',
        '[class*="showing"][class*="type"]'
      ]);

      // Extract selected date and time
      const selectedDate = getTextContent([
        '[data-testid="selected-date"]',
        '.selected-date',
        '.calendar .selected',
        '[class*="date"][class*="selected"]'
      ]);

      const selectedTime = getTextContent([
        '[data-testid="selected-time"]',
        '.selected-time',
        '.time-slot.selected',
        '[class*="time"][class*="selected"]'
      ]);

      // Extract timezone
      const timezone = getTextContent([
        '[data-testid="timezone"]',
        '.timezone',
        '[class*="timezone"]'
      ]);

      // Extract notes
      const notes = getTextContent([
        '[data-testid="notes"]',
        '.notes',
        'textarea',
        '[class*="note"]'
      ]);

      // Extract buyers invited
      const buyersInvited = getTextContentAll([
        '[data-testid="buyers"]',
        '.buyers-list',
        '.invited-buyers',
        '[class*="buyer"]'
      ]);

      // Extract status
      const status = getTextContent([
        '[data-testid="status"]',
        '.status',
        '[class*="status"]'
      ]);

      // Extract property address from page title or header
      const pagePropertyAddress = getTextContent([
        'h1',
        'h2',
        '.property-address',
        '[class*="address"]'
      ]);

      return {
        agent_name: agentName,
        agent_company: agentCompany,
        agent_address: agentAddress,
        agent_email: agentEmail,
        showing_type: showingType || 'Buyer/Broker',
        selected_date: selectedDate,
        selected_time: selectedTime,
        timezone: timezone || 'EDT',
        status: status || 'Pending',
        notes: notes,
        buyers_invited: buyersInvited,
        property_address: pagePropertyAddress || propertyAddress
      };
    });

    // Generate appointment ID from URL or create one
    const currentUrl = page.url();
    const appointmentId = currentUrl.match(/\/listing\/([a-f0-9]+)\/appointments/)?.[1] || 
                         `appt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Prepare the complete appointment data
    const completeAppointmentData = {
      property_id: propertyId,
      appointment_id: appointmentId,
      property_address: appointmentData.property_address,
      agent_name: appointmentData.agent_name,
      agent_company: appointmentData.agent_company,
      agent_address: appointmentData.agent_address,
      agent_email: appointmentData.agent_email,
      showing_type: appointmentData.showing_type,
      selected_date: appointmentData.selected_date,
      selected_time: appointmentData.selected_time,
      timezone: appointmentData.timezone,
      status: appointmentData.status,
      notes: appointmentData.notes,
      buyers_invited: appointmentData.buyers_invited,
      appointment_url: currentUrl,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log("✅ Successfully scraped showing page data");
    return completeAppointmentData;

  } catch (error) {
    console.log("❌ Error scraping showing page:", error.message);
    return null;
  }
};

export default scrapeShowingPage;
