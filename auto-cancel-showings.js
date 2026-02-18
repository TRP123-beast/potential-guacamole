#!/usr/bin/env node

/**
 * ============================================================================
 *  AUTO-CANCEL SHOWINGS SCRIPT
 * ============================================================================
 *
 *  Purpose:
 *    Systematically cancels all active showings on BrokerBay's buyer showings
 *    page that have a status of Confirmed, Pending, or Awaiting Approval.
 *
 *  How it works:
 *    1. Connects to an existing Chrome browser session (via DevTools Protocol)
 *       or launches a new one with a persistent profile.
 *    2. Validates the session – ensures the user is logged in to BrokerBay.
 *    3. Navigates to the showings/buyer page.
 *    4. Scans every pagination page for showing rows whose status badge
 *       matches one of the targeted tags.
 *    5. For each targeted showing it:
 *       a) Clicks the row → opens the showing detail page.
 *       b) Clicks the "Cancel" button.
 *       c) Selects "Client is no longer interested" from the reason dropdown.
 *       d) Clicks "Cancel Showing" to confirm.
 *       e) Waits for the "Showing Cancelled" confirmation.
 *       f) Takes a screenshot as proof.
 *       g) Navigates back to the showings list.
 *    6. After one full pass, does a verification sweep across all pages to
 *       confirm that zero Confirmed/Pending/Awaiting Approval showings remain.
 *    7. Logs a structured summary with counts and any errors.
 *
 *  Usage:
 *    node auto-cancel-showings.js [--dry-run]
 *
 *    --dry-run   Scan and report showings that would be cancelled, but do
 *                not actually cancel anything.
 *
 *  Edge cases handled:
 *    • Pagination – walks through every page in the pagination bar.
 *    • Empty list / no matching showings – exits gracefully.
 *    • Slow-loading pages – generous timeouts with polling loops.
 *    • Stale DOM references – re-queries elements after navigation.
 *    • Dialog not appearing – retries once, then skips with error log.
 *    • Dropdown option not matching exactly – case-insensitive text search.
 *    • Network/browser disconnect – catches top-level errors and prints
 *      a summary of work completed before the failure.
 *    • Already-cancelled showings mixed in – skips them.
 *
 * ============================================================================
 */

import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import fs from "fs/promises";
import { launchWithSession, validateSessionOrPrompt } from "./src/session-manager.js";

puppeteer.use(StealthPlugin());
configDotenv();

// ========================== CONFIGURATION ==========================
const CONFIG = {
    showingsUrl: "https://edge.brokerbay.com/#/my_business/showings/buyer",
    screenshotDir: "src/data/screenshots",
    viewport: { width: 1920, height: 1080 },
    navigationTimeout: 60000,   // 1 minute for page loads
    elementTimeout: 15000,      // 15s for elements to appear
    shortWait: 1000,            // 1s quick pauses
    mediumWait: 2000,           // 2s standard pause
    longWait: 5000,             // 5s page-load settle
    cancelReason: "Client is no longer interested",
    targetedTags: ["confirmed", "pending", "awaiting approval"],
};

const DRY_RUN = process.argv.includes("--dry-run");

// ========================== ANSI COLORS ==========================
const C = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
};

function log(msg, color = "white") {
    console.log(`${C[color] || ""}${msg}${C.reset}`);
}

function logStep(step, msg, status = "info") {
    const icons = { info: "🔍", success: "✅", error: "❌", warning: "⚠️", cancel: "🚫" };
    const colors = { info: "cyan", success: "green", error: "red", warning: "yellow", cancel: "magenta" };
    log(`${icons[status] || "•"} [Step ${step}] ${msg}`, colors[status] || "white");
}

// ========================== HELPERS ==========================

async function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function takeScreenshot(page, name) {
    try {
        await fs.mkdir(CONFIG.screenshotDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const filepath = `${CONFIG.screenshotDir}/${name}_${ts}.png`;
        await page.screenshot({ path: filepath, fullPage: true });
        log(`  📸 Screenshot saved: ${filepath}`, "dim");
        return filepath;
    } catch (err) {
        log(`  ⚠️  Screenshot failed: ${err.message}`, "yellow");
        return null;
    }
}

/**
 * Wait for a selector to appear, returning true/false (never throws).
 */
async function waitForElement(page, selector, timeout = CONFIG.elementTimeout) {
    try {
        await page.waitForSelector(selector, { timeout, visible: true });
        return true;
    } catch {
        return false;
    }
}

/**
 * Click an element with multiple fallback strategies.
 */
async function clickSafely(page, element, description = "element") {
    try {
        await element.evaluate((el) =>
            el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" })
        );
        await wait(300);
        await element.click({ delay: 50 });
        log(`  ✓ Clicked ${description}`, "dim");
        return true;
    } catch (err) {
        log(`  ⚠️  Direct click failed on ${description}: ${err.message}`, "yellow");
        // Fallback 1: mouse coordinates
        try {
            const box = await element.boundingBox();
            if (box) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { delay: 50 });
                log(`  ✓ Clicked ${description} via mouse coordinates`, "dim");
                return true;
            }
        } catch { }
        // Fallback 2: DOM click
        try {
            await page.evaluate((el) => el.click(), element);
            log(`  ✓ Clicked ${description} via DOM .click()`, "dim");
            return true;
        } catch (domErr) {
            log(`  ❌ All click strategies failed for ${description}: ${domErr.message}`, "red");
            return false;
        }
    }
}

/**
 * Find a visible element whose text content includes `text` (case-insensitive).
 * Searches across given CSS selectors.
 */
async function findElementByText(page, selectors, text) {
    const lowerText = text.toLowerCase();
    for (const selector of selectors) {
        const elements = await page.$$(selector);
        for (const el of elements) {
            const elText = await page.evaluate((e) => (e.textContent || "").trim(), el).catch(() => "");
            if (elText.toLowerCase().includes(lowerText)) {
                // Check visibility
                const visible = await page.evaluate((e) => {
                    const r = e.getBoundingClientRect();
                    return r.width > 0 && r.height > 0 && e.offsetParent !== null;
                }, el).catch(() => false);
                if (visible) return el;
            }
        }
    }
    return null;
}

// ========================== SHOWINGS PAGE LOGIC ==========================

/**
 * Navigate to the showings/buyer page and wait for the list to load.
 */
async function navigateToShowings(page) {
    logStep("1", "Navigating to showings page", "info");

    await page.goto(CONFIG.showingsUrl, {
        waitUntil: "domcontentloaded",
        timeout: CONFIG.navigationTimeout,
    });

    await wait(CONFIG.longWait);

    // Wait for showing rows or an "empty" indicator to appear
    const hasContent = await page.evaluate(() => {
        return new Promise((resolve) => {
            let elapsed = 0;
            const interval = setInterval(() => {
                // Look for showing rows (they contain property images + text)
                const rows = document.querySelectorAll(
                    '.showing-event, [ng-repeat*="showing"], .list-group-item, .card, tr'
                );
                // Also look for a "No showings" message
                const bodyText = document.body.innerText || "";
                if (rows.length > 0 || bodyText.includes("No showings") || bodyText.includes("no results")) {
                    clearInterval(interval);
                    resolve(true);
                }
                elapsed += 500;
                if (elapsed > 15000) {
                    clearInterval(interval);
                    resolve(false);
                }
            }, 500);
        });
    });

    if (!hasContent) {
        log("  ⚠️  Page content may not have fully loaded, proceeding anyway", "yellow");
    }

    await takeScreenshot(page, "cancel_01_showings_page");
    logStep("1", "Showings page loaded", "success");
}

/**
 * Get the total number of pagination pages.
 * Returns an array of page numbers, e.g. [1, 2, 3].
 * Falls back to [1] if no pagination is found.
 */
async function getPaginationPages(page) {
    const pages = await page.evaluate(() => {
        // Look for pagination links – BrokerBay uses a simple <ul> with page numbers
        const pageLinks = document.querySelectorAll(
            'ul.pagination li a, .pagination a, nav[aria-label*="pagination"] a, [ng-click*="page"] a, ul.pagination li'
        );

        const pageNumbers = new Set();
        pageLinks.forEach((el) => {
            const text = (el.textContent || "").trim();
            const num = parseInt(text, 10);
            if (!isNaN(num) && num > 0) pageNumbers.add(num);
        });

        if (pageNumbers.size === 0) return [1];
        return Array.from(pageNumbers).sort((a, b) => a - b);
    });

    log(`  📄 Found ${pages.length} pagination page(s): [${pages.join(", ")}]`, "dim");
    return pages;
}

/**
 * Navigate to a specific pagination page number.
 * Returns true if navigation happened, false if already on that page.
 */
async function goToPage(page, pageNum) {
    const clicked = await page.evaluate((num) => {
        const links = document.querySelectorAll(
            'ul.pagination li a, .pagination a, nav[aria-label*="pagination"] a'
        );
        for (const link of links) {
            const text = (link.textContent || "").trim();
            if (text === String(num)) {
                // Check if parent <li> has .active class (already on this page)
                const li = link.closest("li");
                if (li && li.classList.contains("active")) return "already";
                link.click();
                return "clicked";
            }
        }
        // Try <li> elements directly (some Angular UIs)
        const lis = document.querySelectorAll("ul.pagination li");
        for (const li of lis) {
            const text = (li.textContent || "").trim();
            if (text === String(num)) {
                if (li.classList.contains("active")) return "already";
                const a = li.querySelector("a") || li;
                a.click();
                return "clicked";
            }
        }
        return "not_found";
    }, pageNum);

    if (clicked === "clicked") {
        log(`  📄 Navigated to page ${pageNum}`, "dim");
        await wait(CONFIG.mediumWait);
        return true;
    } else if (clicked === "already") {
        log(`  📄 Already on page ${pageNum}`, "dim");
        return false;
    } else {
        log(`  ⚠️  Could not find pagination link for page ${pageNum}`, "yellow");
        return false;
    }
}

/**
 * Scan the current page for showing rows that have a targeted status tag.
 * Returns an array of { index, address, tag, dateText } objects describing
 * the position and details of each matching showing on this page.
 */
async function scanForTargetedShowings(page) {
    const targeted = CONFIG.targetedTags;

    const results = await page.evaluate((targetedTags) => {
        const found = [];

        // Strategy 1: Look for rows that are clickable containers.
        // BrokerBay showings page renders each showing as a clickable row/card
        // containing the property image, address, date/time, and a status badge.
        // The status badge uses <span> with classes like "label label-success" (Confirmed),
        // "label label-warning" (Pending), "label label-info" (Awaiting Approval),
        // "label label-danger" (Cancelled).

        // Find all elements that look like showing rows - they typically contain
        // an image and some text.
        const allRows = document.querySelectorAll(
            '.showing-event, [ng-repeat*="showing"], .list-group-item, .card, .showing-item'
        );

        // Fallback: if no semantic rows found, try broader selectors
        const rowCandidates =
            allRows.length > 0
                ? Array.from(allRows)
                : Array.from(
                    document.querySelectorAll(
                        'div[ng-click], div[ui-sref], a[ui-sref], div.row, .media, .list-group-item'
                    )
                );

        // Also try to find rows by looking for status badge patterns
        const badges = document.querySelectorAll(
            'span.label, span.badge, .status-badge, .tag, [class*="label-"]'
        );

        // Build a map of badge → closest clickable ancestor
        const badgeParentMap = new Map();
        badges.forEach((badge) => {
            const text = (badge.textContent || "").trim().toLowerCase();
            if (targetedTags.includes(text)) {
                // Walk up to find the clickable row ancestor
                let parent = badge.parentElement;
                let depth = 0;
                while (parent && depth < 10) {
                    // Check if this parent is a good "row" container
                    const isClickable =
                        parent.hasAttribute("ng-click") ||
                        parent.hasAttribute("ui-sref") ||
                        parent.tagName === "A" ||
                        parent.getAttribute("role") === "button" ||
                        parent.style.cursor === "pointer" ||
                        parent.classList.contains("showing-event") ||
                        parent.classList.contains("list-group-item") ||
                        parent.classList.contains("card") ||
                        parent.classList.contains("showing-item");

                    // Also check if it contains an image (showing rows have property thumbnails)
                    const hasImage = parent.querySelector("img") !== null;
                    const hasEnoughText = (parent.textContent || "").trim().length > 30;

                    if ((isClickable || hasImage) && hasEnoughText) {
                        if (!badgeParentMap.has(parent)) {
                            badgeParentMap.set(parent, {
                                badgeText: text,
                                element: parent,
                            });
                        }
                        break;
                    }
                    parent = parent.parentElement;
                    depth++;
                }
            }
        });

        // Merge: use badge-based detection (most reliable since it keyed on the status tag)
        let index = 0;
        badgeParentMap.forEach(({ badgeText, element }) => {
            const allText = (element.textContent || "").trim();
            // Try to extract address-like text (the first meaningful text line)
            const textLines = allText
                .split("\n")
                .map((l) => l.trim())
                .filter((l) => l.length > 5 && l.length < 200);
            const addressCandidate = textLines.find(
                (l) =>
                    /\d/.test(l) &&
                    !targetedTags.includes(l.toLowerCase()) &&
                    !l.toLowerCase().includes("buyer") &&
                    !l.toLowerCase().includes("broker") &&
                    l.length > 8
            ) || textLines[0] || "Unknown address";

            // Extract date text
            const dateCandidate = textLines.find(
                (l) =>
                    /\d{1,2}:\d{2}/.test(l) ||
                    /am|pm/i.test(l) ||
                    /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(l)
            ) || "";

            found.push({
                index: index++,
                address: addressCandidate.substring(0, 100),
                tag: badgeText,
                dateText: dateCandidate.substring(0, 80),
            });
        });

        // If badge-based detection found nothing, try scanning rows directly
        if (found.length === 0) {
            rowCandidates.forEach((row, i) => {
                const text = (row.textContent || "").toLowerCase();
                for (const tag of targetedTags) {
                    if (text.includes(tag)) {
                        const allText = (row.textContent || "").trim();
                        const textLines = allText
                            .split("\n")
                            .map((l) => l.trim())
                            .filter((l) => l.length > 5);
                        found.push({
                            index: i,
                            address: (textLines[0] || "Unknown").substring(0, 100),
                            tag: tag,
                            dateText: "",
                        });
                        break; // Only count each row once
                    }
                }
            });
        }

        return found;
    }, targeted);

    return results;
}

/**
 * Click the nth targeted showing on the current page to open its detail view.
 * We re-scan the page and click the element at the given position.
 */
async function clickShowingByIndex(page, showingInfo) {
    const targeted = CONFIG.targetedTags;

    const clicked = await page.evaluate(
        ({ targetedTags, targetIndex }) => {
            // Re-find badges with targeted tags
            const badges = document.querySelectorAll(
                'span.label, span.badge, .status-badge, .tag, [class*="label-"]'
            );

            const matchingRows = [];
            const seen = new Set();

            badges.forEach((badge) => {
                const text = (badge.textContent || "").trim().toLowerCase();
                if (!targetedTags.includes(text)) return;

                let parent = badge.parentElement;
                let depth = 0;
                while (parent && depth < 10) {
                    const isClickable =
                        parent.hasAttribute("ng-click") ||
                        parent.hasAttribute("ui-sref") ||
                        parent.tagName === "A" ||
                        parent.getAttribute("role") === "button" ||
                        parent.style.cursor === "pointer" ||
                        parent.classList.contains("showing-event") ||
                        parent.classList.contains("list-group-item") ||
                        parent.classList.contains("card") ||
                        parent.classList.contains("showing-item");

                    const hasImage = parent.querySelector("img") !== null;
                    const hasEnoughText = (parent.textContent || "").trim().length > 30;

                    if ((isClickable || hasImage) && hasEnoughText) {
                        // Avoid duplicates using DOM identity
                        if (!seen.has(parent)) {
                            seen.add(parent);
                            matchingRows.push(parent);
                        }
                        break;
                    }
                    parent = parent.parentElement;
                    depth++;
                }
            });

            if (targetIndex >= matchingRows.length) return false;

            const target = matchingRows[targetIndex];
            // Try clicking: prefer <a> links inside, then the row itself
            const link =
                target.querySelector('a[href*="showing"], a[ui-sref*="showing"], a[href]') || target;
            link.click();
            return true;
        },
        { targetedTags: targeted, targetIndex: showingInfo.index }
    );

    return clicked;
}

/**
 * On the showing detail page, perform the cancellation flow:
 *  1. Click "Cancel" button
 *  2. Select "Client is no longer interested" from the dropdown
 *  3. Click "Cancel Showing" confirmation button
 *  4. Wait for "Showing Cancelled" confirmation
 */
async function performCancellation(page, showingInfo) {
    logStep("3", `Cancelling: ${showingInfo.address} [${showingInfo.tag}]`, "cancel");

    // Wait for the detail page to load
    await wait(CONFIG.mediumWait);

    // --- Step 3a: Click the "Cancel" button ---
    log("  🔍 Looking for Cancel button...", "dim");

    let cancelBtn = await findElementByText(
        page,
        ["button", "a", "span", '[role="button"]', ".btn"],
        "Cancel"
    );

    if (!cancelBtn) {
        // Broader search: button that starts with "Cancel" but is NOT "Cancel Showing"
        cancelBtn = await page.evaluateHandle(() => {
            const buttons = document.querySelectorAll('button, a, [role="button"], .btn');
            for (const btn of buttons) {
                const text = (btn.textContent || "").trim();
                if (/^✕?\s*Cancel$/i.test(text) || text === "× Cancel" || text === "Cancel") {
                    if (btn.offsetParent !== null) return btn;
                }
            }
            return null;
        });
        cancelBtn = cancelBtn?.asElement ? cancelBtn.asElement() : null;
    }

    if (!cancelBtn) {
        log("  ❌ Cancel button not found on detail page", "red");
        await takeScreenshot(page, "cancel_error_no_cancel_btn");
        return false;
    }

    await clickSafely(page, cancelBtn, "Cancel button");
    await wait(CONFIG.mediumWait);

    // --- Step 3b: Wait for the cancellation dialog ---
    log("  🔍 Waiting for cancellation dialog...", "dim");

    // The dialog asks "Are you sure you want to cancel this showing?"
    // with a "Reason for cancelling" dropdown
    let dialogAppeared = false;

    for (let attempt = 0; attempt < 3; attempt++) {
        const hasDialog = await page.evaluate(() => {
            const bodyText = document.body.innerText || "";
            return (
                bodyText.includes("cancel this showing") ||
                bodyText.includes("Reason for cancelling") ||
                bodyText.includes("Select a reason") ||
                document.querySelector('select, [class*="modal"], .modal, [role="dialog"]') !== null
            );
        });
        if (hasDialog) {
            dialogAppeared = true;
            break;
        }
        await wait(CONFIG.shortWait);
    }

    if (!dialogAppeared) {
        log("  ❌ Cancellation dialog did not appear", "red");
        await takeScreenshot(page, "cancel_error_no_dialog");
        return false;
    }

    log("  ✓ Cancellation dialog appeared", "dim");
    await takeScreenshot(page, "cancel_03_dialog");

    // --- Step 3c: Select reason from dropdown ---
    log(`  🔍 Selecting reason: "${CONFIG.cancelReason}"`, "dim");

    // Try <select> element first
    let reasonSelected = false;

    // Method 1: Native <select> element
    const selectResult = await page.evaluate((reason) => {
        const selects = document.querySelectorAll("select");
        for (const select of selects) {
            if (select.offsetParent === null) continue;
            const options = Array.from(select.options);
            for (let i = 0; i < options.length; i++) {
                const optText = options[i].textContent.trim().toLowerCase();
                if (optText.includes(reason.toLowerCase())) {
                    select.value = options[i].value;
                    select.dispatchEvent(new Event("change", { bubbles: true }));
                    // Also trigger Angular's change detection
                    const inputEvent = new Event("input", { bubbles: true });
                    select.dispatchEvent(inputEvent);
                    return { success: true, method: "native-select", optionText: options[i].textContent.trim() };
                }
            }
        }
        return { success: false };
    }, CONFIG.cancelReason);

    if (selectResult.success) {
        reasonSelected = true;
        log(`  ✓ Selected reason via ${selectResult.method}: "${selectResult.optionText}"`, "dim");
    }

    // Method 2: Custom dropdown (click to open, then click option)
    if (!reasonSelected) {
        log("  ⚠️  Native select not found, trying custom dropdown...", "yellow");

        // Click any dropdown toggle / select-like element
        const dropdownToggle = await findElementByText(
            page,
            ['select', '[class*="select"]', '[class*="dropdown"]', 'button', '[role="listbox"]', '[role="combobox"]'],
            "Select a reason"
        );

        if (dropdownToggle) {
            await clickSafely(page, dropdownToggle, "dropdown toggle");
            await wait(CONFIG.shortWait);

            // Now find and click the option
            const optionEl = await findElementByText(
                page,
                ["li", "option", "div", "span", "a", '[role="option"]', ".dropdown-item"],
                CONFIG.cancelReason
            );

            if (optionEl) {
                await clickSafely(page, optionEl, `reason option: "${CONFIG.cancelReason}"`);
                reasonSelected = true;
                await wait(CONFIG.shortWait);
            }
        }
    }

    // Method 3: Try typing into an input field and selecting
    if (!reasonSelected) {
        log("  ⚠️  Custom dropdown didn't work, trying input-based approach...", "yellow");
        const reasonClicked = await page.evaluate((reason) => {
            // Look for any clickable element containing the reason text
            const allEls = document.querySelectorAll("li, div, span, option, a, button");
            for (const el of allEls) {
                const text = (el.textContent || "").trim();
                if (text.toLowerCase().includes(reason.toLowerCase()) && el.offsetParent !== null) {
                    el.click();
                    return true;
                }
            }
            return false;
        }, CONFIG.cancelReason);

        if (reasonClicked) {
            reasonSelected = true;
            log(`  ✓ Selected reason by clicking matching text element`, "dim");
            await wait(CONFIG.shortWait);
        }
    }

    if (!reasonSelected) {
        log("  ❌ Could not select cancellation reason from dropdown", "red");
        await takeScreenshot(page, "cancel_error_no_reason");
        return false;
    }

    await takeScreenshot(page, "cancel_04_reason_selected");

    // --- Step 3d: Click "Cancel Showing" confirmation button ---
    log('  🔍 Clicking "Cancel Showing" confirmation button...', "dim");

    await wait(CONFIG.shortWait);

    let confirmBtn = await findElementByText(
        page,
        ["button", "a", '[role="button"]', ".btn"],
        "Cancel Showing"
    );

    if (!confirmBtn) {
        // Fallback: find by more specific evaluation
        confirmBtn = await page.evaluateHandle(() => {
            const buttons = document.querySelectorAll('button, a, [role="button"], .btn, input[type="submit"]');
            for (const btn of buttons) {
                const text = (btn.textContent || btn.value || "").trim().toLowerCase();
                if (text === "cancel showing" && btn.offsetParent !== null) return btn;
            }
            // Try partial match
            for (const btn of buttons) {
                const text = (btn.textContent || btn.value || "").trim().toLowerCase();
                if (text.includes("cancel showing") && btn.offsetParent !== null && !btn.disabled) return btn;
            }
            return null;
        });
        confirmBtn = confirmBtn?.asElement ? confirmBtn.asElement() : null;
    }

    if (!confirmBtn) {
        log('  ❌ "Cancel Showing" button not found or not enabled', "red");
        await takeScreenshot(page, "cancel_error_no_confirm_btn");
        return false;
    }

    // Check if the button is disabled
    const isDisabled = await page.evaluate((el) => el.disabled || el.classList.contains("disabled"), confirmBtn);
    if (isDisabled) {
        log('  ❌ "Cancel Showing" button is disabled – reason may not have been selected properly', "red");
        await takeScreenshot(page, "cancel_error_btn_disabled");
        return false;
    }

    await clickSafely(page, confirmBtn, '"Cancel Showing" button');
    await wait(CONFIG.mediumWait);

    // --- Step 3e: Verify cancellation ---
    log("  🔍 Verifying cancellation...", "dim");

    let verified = false;
    for (let attempt = 0; attempt < 5; attempt++) {
        const confirmation = await page.evaluate(() => {
            const bodyText = (document.body.innerText || "").toLowerCase();
            return (
                bodyText.includes("showing cancelled") ||
                bodyText.includes("has been cancelled") ||
                bodyText.includes("successfully cancelled") ||
                bodyText.includes("cancellation confirmed")
            );
        });
        if (confirmation) {
            verified = true;
            break;
        }

        // Also check if the tag changed to "Cancelled"
        const tagChanged = await page.evaluate(() => {
            const badges = document.querySelectorAll('span.label, span.badge, .status-badge, .tag, [class*="label-"]');
            for (const badge of badges) {
                if ((badge.textContent || "").trim().toLowerCase() === "cancelled") return true;
            }
            return false;
        });
        if (tagChanged) {
            verified = true;
            break;
        }

        await wait(CONFIG.shortWait);
    }

    if (verified) {
        log("  ✅ Showing Cancelled – confirmed!", "green");
    } else {
        log("  ⚠️  Could not detect cancellation confirmation text, but proceeding", "yellow");
    }

    await takeScreenshot(page, "cancel_05_cancelled");
    return true;
}

// ========================== MAIN ORCHESTRATOR ==========================

async function main() {
    log("\n" + "═".repeat(70), "bright");
    log("  🚫  AUTO-CANCEL SHOWINGS SCRIPT", "bright");
    log("═".repeat(70), "bright");
    if (DRY_RUN) {
        log("  ⚡ DRY RUN MODE – no showings will actually be cancelled\n", "yellow");
    }
    log(`  Target tags : ${CONFIG.targetedTags.join(", ")}`, "dim");
    log(`  Cancel reason: ${CONFIG.cancelReason}`, "dim");
    log(`  Showings URL : ${CONFIG.showingsUrl}`, "dim");
    log("", "white");

    const stats = {
        scanned: 0,
        cancelled: 0,
        skipped: 0,
        failed: 0,
        alreadyCancelled: 0,
        errors: [],
    };

    let browser = null;
    let page = null;

    try {
        // === STEP 0: Launch/connect browser ===
        logStep("0", "Connecting to browser", "info");

        browser = await launchWithSession({
            headless: process.env.HEADLESS !== "false",
            defaultViewport: CONFIG.viewport,
        });

        logStep("0", "Browser connected", "success");

        // === STEP 0.1: Find or create a page ===
        // Reuse existing tab/session if connected to existing browser
        // (same logic as auto-book-enhanced.js)
        let reusedTab = false;

        if (browser.isConnectedToExisting) {
            logStep("0.1", "Checking for open BrokerBay tabs...", "info");
            const allPages = await browser.pages();

            // Look for a tab that is already on BrokerBay (not the login page)
            const brokerBayPage = allPages.find((p) => {
                const url = p.url();
                return url.includes("brokerbay.com") && !url.includes("auth.brokerbay.com/login");
            });

            if (brokerBayPage) {
                log(`  ✅ Found existing BrokerBay tab: ${brokerBayPage.url()}`, "green");
                log(`  ✅ Reusing authenticated session - validation will be skipped`, "green");
                page = brokerBayPage;
                reusedTab = true;

                // Bring it to front
                try {
                    await page.bringToFront();
                    log(`  ✓ Brought tab to front`, "dim");
                } catch (e) {
                    log(`  ⚠️  Could not bring tab to front: ${e.message}`, "dim");
                }
            } else {
                log(`  ℹ️  No active BrokerBay tab found. Opening new tab...`, "dim");
                page = await browser.newPage();
            }
        } else {
            const allPages = await browser.pages();
            page = allPages.length > 0 ? allPages[0] : await browser.newPage();
        }

        await page.setViewport(CONFIG.viewport);

        // === STEP 0.5: Validate session ===
        // Skip validation if we reused an authenticated tab - it's already verified
        if (reusedTab) {
            logStep("0.5", "Skipping session validation - using existing authenticated tab", "success");
            log(`  ✓ Tab already authenticated at: ${page.url()}`, "dim");
            log(`  ✓ Proceeding directly to cancellation flow`, "dim");
        } else {
            logStep("0.5", "Validating BrokerBay session", "info");

            // Navigate to BrokerBay if we're not there yet
            if (!page.url().includes("brokerbay.com")) {
                await page.goto("https://edge.brokerbay.com/#/my_business", {
                    waitUntil: "domcontentloaded",
                    timeout: CONFIG.navigationTimeout,
                });
                await wait(3000);
            } else {
                log(`  ✓ Already on BrokerBay page`, "dim");
            }

            // Check if session is still valid (skip navigation if already on BrokerBay)
            await validateSessionOrPrompt(page, true);
            logStep("0.5", "Session validated - already logged in", "success");
        }

        // === STEP 1: Navigate to showings ===
        await navigateToShowings(page);

        // === STEP 2: Scan & Cancel Loop ===
        logStep("2", "Scanning for showings to cancel", "info");

        let passNumber = 0;
        let keepGoing = true;

        while (keepGoing) {
            passNumber++;
            log(`\n${"─".repeat(50)}`, "dim");
            log(`  🔄 Pass #${passNumber}`, "cyan");
            log(`${"─".repeat(50)}`, "dim");

            // Always start from the showings list page
            if (passNumber > 1) {
                await navigateToShowings(page);
            }

            const paginationPages = await getPaginationPages(page);
            let foundAnyThisPass = false;

            for (const pageNum of paginationPages) {
                if (pageNum > 1) {
                    await goToPage(page, pageNum);
                    await wait(CONFIG.mediumWait);
                }

                const showings = await scanForTargetedShowings(page);
                stats.scanned += showings.length;

                if (showings.length === 0) {
                    log(`  📄 Page ${pageNum}: No targeted showings found`, "dim");
                    continue;
                }

                log(`  📄 Page ${pageNum}: Found ${showings.length} targeted showing(s)`, "cyan");

                for (const showing of showings) {
                    log(
                        `\n  ┌─ Showing: ${showing.address}`,
                        "white"
                    );
                    log(`  │  Tag: ${showing.tag}  |  Date: ${showing.dateText || "N/A"}`, "dim");

                    if (DRY_RUN) {
                        log("  └─ [DRY RUN] Would cancel this showing", "yellow");
                        stats.skipped++;
                        continue;
                    }

                    foundAnyThisPass = true;

                    // Click the showing to open detail page
                    log("  │  Opening showing detail page...", "dim");

                    // Always re-navigate to the correct page before clicking
                    // (because after a cancellation we come back and the list may have shifted)
                    if (pageNum > 1) {
                        await navigateToShowings(page);
                        await goToPage(page, pageNum);
                        await wait(CONFIG.mediumWait);
                    }

                    // Re-scan to get fresh references (DOM may have changed)
                    const freshShowings = await scanForTargetedShowings(page);
                    if (freshShowings.length === 0) {
                        log("  └─ ⚠️  No more targeted showings on this page after re-scan", "yellow");
                        break;
                    }

                    // Click the first targeted showing (always index 0 since we process one at a time)
                    const clickResult = await clickShowingByIndex(page, { ...freshShowings[0], index: 0 });
                    if (!clickResult) {
                        log("  └─ ❌ Failed to click showing row", "red");
                        stats.failed++;
                        stats.errors.push(`Failed to click: ${showing.address}`);
                        continue;
                    }

                    await wait(CONFIG.mediumWait);

                    // Verify we're on a detail page
                    const onDetailPage = await page.evaluate(() => {
                        const url = window.location.href;
                        const bodyText = (document.body.innerText || "").toLowerCase();
                        return (
                            url.includes("/showing/") ||
                            bodyText.includes("cancel") ||
                            bodyText.includes("reschedule") ||
                            bodyText.includes("showing request") ||
                            bodyText.includes("your showing")
                        );
                    });

                    if (!onDetailPage) {
                        log("  └─ ⚠️  May not be on detail page, attempting cancellation anyway", "yellow");
                    }

                    await takeScreenshot(page, `cancel_02_detail_${stats.cancelled + 1}`);

                    // Perform the cancellation
                    const success = await performCancellation(page, showing);

                    if (success) {
                        stats.cancelled++;
                        log(`  └─ ✅ Successfully cancelled (${stats.cancelled} total)`, "green");
                    } else {
                        stats.failed++;
                        stats.errors.push(`Failed to cancel: ${showing.address}`);
                        log(`  └─ ❌ Cancellation failed`, "red");
                    }

                    // Navigate back to the showings list for the next one
                    // We always go back to page 1, and re-scan – because after a cancellation,
                    // the list re-orders and pagination shifts.
                    await wait(CONFIG.shortWait);
                    break; // Break inner loop – restart from page 1 after each cancellation
                }

                if (foundAnyThisPass) {
                    break; // Break pagination loop – restart full scan after a cancellation
                }
            }

            if (DRY_RUN) {
                keepGoing = false; // Only do one pass in dry-run mode
            } else if (!foundAnyThisPass) {
                keepGoing = false; // No more targeted showings found
            }
            // Otherwise loop continues: we cancelled something and need to re-scan
        }

        // === STEP 4: Final verification ===
        logStep("4", "Final verification – checking all pages for remaining targeted showings", "info");

        await navigateToShowings(page);
        const finalPages = await getPaginationPages(page);
        let remainingCount = 0;

        for (const pageNum of finalPages) {
            if (pageNum > 1) {
                await goToPage(page, pageNum);
                await wait(CONFIG.mediumWait);
            }
            const remaining = await scanForTargetedShowings(page);
            remainingCount += remaining.length;
            if (remaining.length > 0) {
                log(`  ⚠️  Page ${pageNum}: ${remaining.length} targeted showing(s) still remain`, "yellow");
                remaining.forEach((s) => {
                    log(`     • ${s.address} [${s.tag}]`, "yellow");
                });
            } else {
                log(`  ✓ Page ${pageNum}: Clean – no targeted showings`, "dim");
            }
        }

        await takeScreenshot(page, "cancel_06_final_verification");

        if (remainingCount === 0) {
            logStep("4", "Verification passed – all targeted showings have been cancelled! ✨", "success");
        } else {
            logStep(
                "4",
                `Verification: ${remainingCount} targeted showing(s) still remain`,
                "warning"
            );
        }
    } catch (error) {
        log(`\n❌ FATAL ERROR: ${error.message}`, "red");
        log(`   Stack: ${error.stack}`, "dim");
        stats.errors.push(`Fatal: ${error.message}`);

        if (page) {
            await takeScreenshot(page, "cancel_error_fatal");
        }
    } finally {
        // === SUMMARY ===
        log("\n" + "═".repeat(70), "bright");
        log("  📊  CANCELLATION SUMMARY", "bright");
        log("═".repeat(70), "bright");
        log(`  Showings scanned   : ${stats.scanned}`, "white");
        log(`  Successfully cancelled: ${stats.cancelled}`, "green");
        log(`  Failed             : ${stats.failed}`, stats.failed > 0 ? "red" : "white");
        log(`  Skipped (dry-run)  : ${stats.skipped}`, stats.skipped > 0 ? "yellow" : "white");

        if (stats.errors.length > 0) {
            log("\n  Errors:", "red");
            stats.errors.forEach((e, i) => log(`    ${i + 1}. ${e}`, "red"));
        }

        log("\n" + "═".repeat(70) + "\n", "bright");

        // Close browser (but don't close if connected to existing)
        if (browser) {
            try {
                if (browser.isConnectedToExisting) {
                    log("  ℹ️  Disconnecting from existing browser (not closing it)", "dim");
                    browser.disconnect();
                } else {
                    await browser.close();
                }
            } catch { }
        }
    }
}

// ========================== ENTRY POINT ==========================
main().catch((err) => {
    console.error("\n💥 Unhandled error:", err);
    process.exit(1);
});
