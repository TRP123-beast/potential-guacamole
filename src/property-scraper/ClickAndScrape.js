import { configDotenv } from "dotenv";
import fs from "fs/promises";
import path from "path";
import { waitFor } from "../utils.js";
import { readPropertyDetails } from "./ReadPropertyDetails.js";
import { createProperty } from "../ReadAndSaveData.js";

configDotenv();

// Click the first visible search result item under the dashboard search bar,
// navigate to its details page, scrape, persist, and write a txt report.
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
      await waitFor(500);
    }

    // Strategy 1: Coordinate-based clicking below search button
    let previousUrl = page.url();
    let success = false;
    
    try {
      // Find the search button and click below it
      const searchButton = await page.$('[data-cy="open-search-button"]');
      if (searchButton) {
        const buttonBox = await searchButton.boundingBox();
        if (buttonBox) {
          // Click 50-100px below the search button, slightly to the right
          const clickX = buttonBox.x + buttonBox.width / 2;
          const clickY = buttonBox.y + buttonBox.height + 80; // 80px below button
          
          console.log(`🎯 Clicking at coordinates: ${clickX}, ${clickY}`);
          await page.mouse.click(clickX, clickY, { delay: 100 });
          await waitFor(1000);
          
          // Check if URL changed
          const newUrl = page.url();
          if (newUrl !== previousUrl) {
            console.log('✅ Coordinate click successful - URL changed');
            success = true;
          } else {
            console.log('⚠️ Coordinate click - no URL change, trying alternative coordinates');
            // Try clicking a bit more to the right
            await page.mouse.click(clickX + 50, clickY, { delay: 100 });
            await waitFor(1000);
            if (page.url() !== previousUrl) {
              console.log('✅ Alternative coordinate click successful');
              success = true;
            }
          }
        }
      }
    } catch (e) {
      console.log('⚠️ Coordinate click failed:', e.message);
    }

    // Strategy 2: Keyboard navigation (if coordinate click failed)
    if (!success) {
      try {
        await page.keyboard.press('ArrowDown');
        await waitFor(200);
        await page.keyboard.press('Enter');
        await Promise.race([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }),
          page.waitForFunction((prev) => window.location.href !== prev, { timeout: 5000 }, previousUrl)
        ]);
        console.log('⌨️ Selected first result via keyboard');
        success = true;
      } catch (_) {
        // Try a second attempt with two ArrowDown presses
        try {
          await page.keyboard.press('ArrowDown');
          await waitFor(150);
          await page.keyboard.press('ArrowDown');
          await waitFor(150);
          await page.keyboard.press('Enter');
          await Promise.race([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }),
            page.waitForFunction((prev) => window.location.href !== prev, { timeout: 5000 }, previousUrl)
          ]);
          console.log('⌨️ Selected result via keyboard (second attempt)');
          success = true;
        } catch (_) {
          console.log('⚠️ Keyboard navigation failed, continuing to DOM-based strategies');
        }
      }
    }

    // Strategy 3: XPath-based selection (if previous strategies failed)
    if (!success) {
      try {
        // Wait for search results to appear
        await page.waitForSelector('[role="dialog"], .ant-modal, .ant-drawer', { timeout: 3000 });
        
        // Use XPath to find the first clickable result
        const firstResult = await page.$x('//div[contains(@class, "ant-list-item") or contains(@class, "result") or contains(@class, "item")][1]');
        if (firstResult.length > 0) {
          console.log('🎯 Found result via XPath, attempting click');
          await firstResult[0].click();
          await waitFor(1000);
          
          if (page.url() !== previousUrl) {
            console.log('✅ XPath click successful');
            success = true;
          }
        }
      } catch (e) {
        console.log('⚠️ XPath selection failed:', e.message);
      }
    }

    // Strategy 4: DOM-based selection (if all previous strategies failed)
    if (!success) {
      // Try to locate the global search modal or dropdown first
      const modalOrResultsSelectors = [
        '[role="dialog"]',
        '.ant-modal',
        '.ant-drawer',
        'ul[role="listbox"]',
        'div[role="listbox"]',
      ];
      for (const sel of modalOrResultsSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 2000 });
          break; // Found something that likely holds results
        } catch (_) {
          // keep trying
        }
      }

      // Wait specifically for first result row to render within dialog
      const firstRowSelectors = [
        '[role="dialog"] .ant-list-item',
        '.ant-modal .ant-list-item',
        '.ant-drawer .ant-list-item',
        '[role="dialog"] li',
        '.ant-modal li',
        'ul[role="listbox"] li',
        'div[role="listbox"] [role="option"]'
      ];
      let rowLocated = false;
      for (const sel of firstRowSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 4000 });
          rowLocated = true;
          break;
        } catch (_) {}
      }

      // 1) Identify the first visible row in the modal and either get its href or a safe click point
      const target = await page.evaluate(() => {
        const root = document.querySelector('[role="dialog"], .ant-modal, .ant-drawer') || document.body;
        // Collect row-like elements in the modal
        const candidates = Array.from(root.querySelectorAll(
          '.ant-list-item, .ant-select-item, [class*="list"] [class*="item"], [class*="result"], ul[role="listbox"] li, div[role="listbox"] [role="option"]'
        ));

        function isVisible(el) {
          const r = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return r.width > 1 && r.height > 1 && style.visibility !== 'hidden' && style.display !== 'none';
        }

        let row = candidates.find(isVisible) || null;
        if (!row) return { href: null, x: null, y: null };

        // Prefer an anchor within the row
        const a = row.querySelector('a[href]');
        if (a && isVisible(a)) {
          const href = a.href || a.getAttribute('href');
          if (href) return { href, x: null, y: null };
        }

        // Compute a safe click point in the left side of the row (avoid right-side action buttons)
        const r = row.getBoundingClientRect();
        const x = r.left + Math.min(200, Math.max(20, r.width * 0.2));
        const y = r.top + Math.min(r.height - 5, Math.max(10, r.height * 0.5));
        return { href: null, x, y };
      });

      if (target && target.href) {
        // Normalize relative URLs
        const targetUrl = target.href.startsWith('http') ? target.href : new URL(target.href, page.url()).toString();
        console.log(`🧭 Navigating to first result via href: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      } else {
        // 2) No anchor? Click the first visible result container or fallback list items
        let clicked = false;
        if (target && target.x && target.y) {
          try {
            await page.mouse.click(target.x, target.y, { delay: 20 });
            clicked = true;
            console.log("🖱️ Clicked first result at computed position; waiting for navigation...");
          } catch (e) {
            console.log("⚠️ Coordinate click failed, falling back to element click:", e.message);
          }
        }

        if (!clicked) {
          const candidateSelectors = [
            'ul[role="listbox"] li',
            'div[role="listbox"] [role="option"]',
            '.ant-select-item',
            '.ant-list-item',
            '[data-testid*="result" i]',
            '[class*="search" i] li',
          ];

          let firstItemHandle = null;
          for (const sel of candidateSelectors) {
            try {
              await page.waitForSelector(sel, { timeout: 3000 });
              const handles = await page.$$(sel);
              if (handles && handles.length > 0) {
                firstItemHandle = handles[0];
                break;
              }
            } catch (_) {}
          }

          if (firstItemHandle) {
            const box = await firstItemHandle.boundingBox();
            if (box) {
              await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { delay: 20 });
            } else {
              await firstItemHandle.click();
            }
            console.log("🖱️ Clicked the first search result container; waiting for navigation...");
          } else {
            // 3) Fallback: keyboard select first item
            console.log("⌨️ Falling back to keyboard selection (ArrowDown + Enter)");
            await page.keyboard.press('ArrowDown');
            await waitFor(250);
            await page.keyboard.press('Enter');
          }
        }
      }

      // Wait for URL to change or content to load
      try {
        await Promise.race([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }),
          page.waitForFunction(
            (prev) => window.location.href !== prev,
            { timeout: 15000 },
            previousUrl
          ),
        ]);
      } catch (_) {
        // SPA may not fire navigation; allow some time
        await waitFor(6000);
      }
    } // End of Strategy 4: DOM-based selection

    const propertyUrl = page.url();
    console.log(`🔗 Landed on: ${propertyUrl}`);

    // Scrape details using the dedicated scraper
    const details = await readPropertyDetails(browser, propertyUrl);
    if (!details) {
      console.log("❌ Failed to scrape property details");
      return null;
    }

    // Persist to local SQLite
    const saved = createProperty(details);

    // Write a human-readable txt report
    const lines = [];
    lines.push(`# Property Report`);
    lines.push(`Address: ${saved.address}`);
    lines.push(`Price: ${saved.price}`);
    lines.push(`Bedrooms: ${saved.bedrooms}`);
    lines.push(`Bathrooms: ${saved.bathrooms}`);
    lines.push(`SqFt: ${saved.sqft}`);
    lines.push(`MLS: ${saved.mls_number}`);
    lines.push(`Status: ${saved.status}`);
    lines.push(`Type: ${saved.property_type}`);
    lines.push(`Agent: ${saved.agent}`);
    lines.push(`Agent Phone: ${saved.agent_phone}`);
    lines.push(`Year Built: ${saved.year_built ?? ''}`);
    lines.push(`Lot Size: ${saved.lot_size ?? ''}`);
    lines.push(`Parking Spaces: ${saved.parking_spaces}`);
    lines.push(`URL: ${saved.url}`);
    lines.push("");
    if (saved.description) {
      lines.push("Description:");
      lines.push(saved.description);
      lines.push("");
    }
    if (saved.features) {
      lines.push("Features/Details JSON:");
      lines.push(typeof saved.features === 'string' ? saved.features : JSON.stringify(saved.features, null, 2));
      lines.push("");
    }

    const outDir = path.resolve("src/data");
    const outPath = path.join(outDir, "last-scrape.txt");
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(outPath, lines.join("\n"), "utf-8");
    console.log(`📝 Wrote human-readable report: ${outPath}`);

    return saved;
  } catch (error) {
    console.log("❌ clickFirstResultAndScrape error:", error.message);
    return null;
  }
}

export default clickFirstResultAndScrape;