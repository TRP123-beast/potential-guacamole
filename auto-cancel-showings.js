#!/usr/bin/env node

/**
 * ============================================================================
 *  AUTO-CANCEL SHOWINGS  (v3 — URL-direct navigation)
 * ============================================================================
 *
 *  CLI usage:
 *    node auto-cancel-showings.js                          # cancel ALL targeted showings
 *    node auto-cancel-showings.js --dry-run                # list only, no cancellations
 *    node auto-cancel-showings.js "42 Iangrove Terrace"    # cancel ONE specific property
 *    node auto-cancel-showings.js --dry-run "42 Iangrove"  # dry-run for one property
 *
 *  Targeted statuses:  Confirmed | Awaiting Approval | Pending
 *  Skip statuses:      Cancelled (already done)
 *  Cancel reason:      "Client is no longer interested"
 *
 *  How it works:
 *   1. Connects to the existing Chrome session (port 9222 CDP) — same approach
 *      as auto-book-enhanced.js.  Falls back to launching a new browser with
 *      the exported-session.json cookies if no browser is found on port 9222.
 *   2. Navigates to https://edge.brokerbay.com/#/my_business/showings/buyer
 *   3. Scans every pagination page using TEXT-CONTENT matching for status
 *      badges — not fragile CSS class selectors.
 *   4. For each targeted showing it EXTRACTS THE DETAIL URL from the DOM
 *      (href, ui-sref, or by monitoring the hash after a click), then
 *      navigates DIRECTLY to that URL rather than clicking by DOM index.
 *   5. On the detail page: Cancel → select reason → Cancel Showing → verify.
 *   6. Exports runCancellationSweep() for use by the auto-booking worker.
 *
 * ============================================================================
 */

import { configDotenv } from "dotenv";
import fs from "fs/promises";
import { launchWithSession, isSessionValid } from "./src/session-manager.js";

configDotenv();

// ========================== CONFIGURATION ==========================
const CONFIG = {
    showingsUrl: "https://edge.brokerbay.com/#/my_business/showings/buyer",
    screenshotDir: "src/data/screenshots",
    viewport: { width: 1920, height: 1080 },
    navigationTimeout: 60000,
    elementTimeout: 20000,
    shortWait: 800,
    mediumWait: 2000,
    longWait: 5000,
    cancelReason: "Client is no longer interested",
    targetedTags: ["confirmed", "pending", "awaiting approval"],
};

// ========================== CLI ARG PARSING ==========================
const rawArgs = process.argv.slice(2);
const DRY_RUN = rawArgs.includes("--dry-run");
const ADDRESS_FLAG_IDX = rawArgs.indexOf("--address");
let TARGET_ADDRESS = null;
if (ADDRESS_FLAG_IDX !== -1 && rawArgs[ADDRESS_FLAG_IDX + 1]) {
    TARGET_ADDRESS = rawArgs[ADDRESS_FLAG_IDX + 1].trim().toLowerCase();
} else {
    const positional = rawArgs.filter((a) => !a.startsWith("--"));
    if (positional.length > 0) {
        TARGET_ADDRESS = positional[0].trim().toLowerCase();
    }
}

const _isMainModule =
    process.argv[1] &&
    import.meta.url.endsWith(
        process.argv[1].replace(/\\/g, "/").split("/").pop()
    );

// ========================== ANSI COLOURS ==========================
const C = {
    reset: "\x1b[0m", bright: "\x1b[1m", dim: "\x1b[2m",
    red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
    blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m", white: "\x1b[37m",
};
function log(msg, color = "white") {
    console.log(`${C[color] || ""}${msg}${C.reset}`);
}

// ========================== HELPERS ==========================
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function takeScreenshot(page, name) {
    try {
        await fs.mkdir(CONFIG.screenshotDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const fp = `${CONFIG.screenshotDir}/${name}_${ts}.png`;
        await page.screenshot({ path: fp, fullPage: true });
        log(`  📸 ${fp}`, "dim");
        return fp;
    } catch (err) {
        log(`  ⚠️  screenshot failed: ${err.message}`, "yellow");
        return null;
    }
}

async function waitForElement(page, selector, timeout = CONFIG.elementTimeout) {
    try {
        await page.waitForSelector(selector, { timeout, visible: true });
        return true;
    } catch {
        return false;
    }
}

/**
 * Scroll an element into view and click it using three fallback strategies.
 */
async function clickSafely(page, element, description = "element") {
    try {
        await element.evaluate((el) =>
            el.scrollIntoView({ behavior: "smooth", block: "center" })
        );
        await wait(300);
        await element.click({ delay: 50 });
        log(`  ✓ Clicked ${description}`, "dim");
        return true;
    } catch {
        try {
            const box = await element.boundingBox();
            if (box) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                log(`  ✓ Clicked ${description} via mouse coords`, "dim");
                return true;
            }
        } catch { }
        try {
            await page.evaluate((el) => el.click(), element);
            log(`  ✓ Clicked ${description} via DOM .click()`, "dim");
            return true;
        } catch (e) {
            log(`  ❌ All click strategies failed for ${description}: ${e.message}`, "red");
            return false;
        }
    }
}

// ========================== PAGE LOAD HELPERS ==========================

async function waitForShowingsList(page) {
    const start = Date.now();
    while (Date.now() - start < 20000) {
        const ready = await page.evaluate(() => {
            const body = document.body.innerText || "";
            // Showings page has loaded if we can see a status badge text
            const hasContent =
                body.includes("Confirmed") ||
                body.includes("Awaiting Approval") ||
                body.includes("Pending") ||
                body.includes("Cancelled") ||
                body.includes("No showings") ||
                body.includes("no results");
            return hasContent;
        });
        if (ready) return true;
        await wait(800);
    }
    return false;
}

/**
 * Dismiss the cancellation confirmation modal if it is currently open.
 * Tries "Back" button first, then Escape key. This MUST be called before any
 * page navigation after a failed cancellation so the modal overlay is gone and
 * Angular routing is unblocked for the next iteration.
 */
async function dismissModalIfOpen(page) {
    const isOpen = await page.evaluate(() => {
        return !!(
            document.querySelector('.ant-modal, .ant-modal-wrap, [role="dialog"]') ||
            document.body.innerText.includes("Reason for cancelling") ||
            document.body.innerText.includes("Are you sure you want to cancel")
        );
    });

    if (!isOpen) return;

    log("  🔄 Dismissing open modal...", "dim");

    const clicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        for (const btn of btns) {
            if (btn.offsetParent === null) continue;
            const t = (btn.textContent || "").trim().toLowerCase();
            if (t === "back") { btn.click(); return "back"; }
        }
        const closeBtn = document.querySelector(
            '.ant-modal-close, [aria-label="Close"], .ant-modal-close-x'
        );
        if (closeBtn && closeBtn.offsetParent !== null) { closeBtn.click(); return "close"; }
        return null;
    });

    if (!clicked) {
        await page.keyboard.press("Escape");
    }

    await wait(CONFIG.mediumWait);
    log(`  ✓ Modal dismissed (${clicked || "Escape"})`, "dim");
}

async function navigateToShowings(page) {
    await dismissModalIfOpen(page);
    log("  🔍 Navigating to showings list...", "cyan");
    await page.goto(CONFIG.showingsUrl, {
        waitUntil: "domcontentloaded",
        timeout: CONFIG.navigationTimeout,
    });
    await wait(CONFIG.longWait);
    await waitForShowingsList(page);
    log(`  ✓ Showings list loaded: ${page.url()}`, "dim");
}

// ========================== PAGINATION ==========================

/**
 * Returns the max page number visible in the pagination bar.
 * Returns 1 if no pagination found.
 */
async function getTotalPages(page) {
    return page.evaluate(() => {
        // Strategy 1: look for numbered pagination links
        const selectors = [
            "ul.pagination li a",
            ".pagination a",
            "nav[aria-label*='pagination'] a",
            "[class*='pagination'] [class*='page']",
            "[class*='pager'] a",
        ];
        const nums = new Set();
        for (const sel of selectors) {
            document.querySelectorAll(sel).forEach((el) => {
                const n = parseInt((el.textContent || "").trim(), 10);
                if (!isNaN(n) && n > 0) nums.add(n);
            });
        }
        if (nums.size > 0) return Math.max(...nums);

        // Strategy 2: look for "Page X of Y" text
        const body = document.body.innerText || "";
        const match = body.match(/page\s+\d+\s+of\s+(\d+)/i);
        if (match) return parseInt(match[1], 10);

        return 1;
    });
}

/**
 * Navigate to a specific pagination page. Returns true if clicked.
 */
async function goToPage(page, pageNum) {
    if (pageNum === 1) return true;

    const clicked = await page.evaluate((num) => {
        const candidates = document.querySelectorAll(
            "ul.pagination li a, .pagination a, [class*='pagination'] a, [class*='pager'] a"
        );
        for (const el of candidates) {
            if ((el.textContent || "").trim() === String(num)) {
                const li = el.closest("li");
                if (li?.classList.contains("active")) return "already";
                el.click();
                return "clicked";
            }
        }
        // Try <li> direct click
        const lis = document.querySelectorAll("ul.pagination li, [class*='pagination'] li");
        for (const li of lis) {
            if ((li.textContent || "").trim() === String(num)) {
                if (li.classList.contains("active")) return "already";
                (li.querySelector("a") || li).click();
                return "clicked";
            }
        }
        return "not_found";
    }, pageNum);

    if (clicked === "clicked") {
        await wait(CONFIG.mediumWait);
        await waitForShowingsList(page);
        log(`  📄 Navigated to page ${pageNum}`, "dim");
        return true;
    } else if (clicked === "already") {
        return true;
    }

    log(`  ⚠️  Pagination link for page ${pageNum} not found`, "yellow");
    return false;
}

// ========================== CORE SCAN (text-content based) ==========================

/**
 * Scans the CURRENT page for targeted showings using TEXT-CONTENT matching
 * on badge elements (not fragile CSS class selectors).
 *
 * Returns an array of:
 *   { address, tag, dateText, detailUrl }
 *
 * detailUrl is extracted from href/ui-sref of the row container, or null if
 * it can only be obtained by clicking the row.
 */
async function scanCurrentPage(page) {
    return page.evaluate((config) => {
        const { targetedTags } = config;
        const found = [];

        /**
         * Returns true if the node's visible text contains a street-address
         * pattern: a number followed by at least one word (e.g. "42 Iangrove").
         * Uses innerText so CSS block-level formatting is respected.
         */
        function containsStreetAddress(node) {
            const text = node.innerText || node.textContent || "";
            return /\b\d+[a-zA-Z]?\s+[A-Za-z]{2,}/.test(text) && text.trim().length > 30;
        }

        /**
         * Walk UP from el looking for the row container.
         * Requires the candidate to be interactive AND contain a street address —
         * this avoids stopping at the small status-badge sub-container.
         * Falls back to the first interactive ancestor if none with address found.
         */
        function findRowAncestor(el, maxDepth = 18) {
            let fallback = null;
            let node = el.parentElement;
            let depth = 0;
            while (node && depth < maxDepth) {
                const tag = node.tagName.toLowerCase();
                const isLink = tag === "a";
                const hasNgClick = node.hasAttribute("ng-click");
                const hasUiSref = node.hasAttribute("ui-sref");
                const hasRole = node.getAttribute("role") === "button";
                const hasCursor = getComputedStyle(node).cursor === "pointer";
                const hasImg = node.querySelector("img") !== null;
                const textLen = (node.textContent || "").trim().length;

                const isInteractive = isLink || hasNgClick || hasUiSref || hasRole || hasCursor || hasImg;

                if (isInteractive && textLen > 20) {
                    if (containsStreetAddress(node)) {
                        return node;
                    }
                    if (!fallback) fallback = node;
                }
                node = node.parentElement;
                depth++;
            }
            return fallback;
        }

        /**
         * Extract address-like text from a container element.
         * Uses innerText (respects CSS block boundaries) so each visual line
         * is split correctly — unlike textContent which concatenates inline spans.
         */
        function extractAddress(container) {
            const raw = container.innerText || container.textContent || "";
            const lines = raw
                .split(/[\n\r]+/)
                .map((l) => l.trim())
                .filter((l) => l.length > 5 && l.length < 140);

            const withDigit = lines.find(
                (l) =>
                    /^\d/.test(l) &&
                    !/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(l) &&
                    !/^\d{1,2}:\d{2}/.test(l) &&
                    !/^\d{4}$/.test(l)
            );
            if (withDigit) return withDigit;

            const clean = lines.find(
                (l) =>
                    !targetedTags.includes(l.toLowerCase()) &&
                    !/^\d{1,2}:\d{2}/.test(l) &&
                    l !== "•" &&
                    !/^(buyer|broker|seller|tenant|landlord)/i.test(l)
            );
            return clean || lines[0] || "Unknown";
        }

        /**
         * Extract a date/time text from a container element.
         */
        function extractDate(container) {
            const raw = container.innerText || container.textContent || "";
            const lines = raw
                .split(/[\n\r]+/)
                .map((l) => l.trim())
                .filter((l) => l.length > 3);
            return (
                lines.find(
                    (l) =>
                        /\d{1,2}:\d{2}/.test(l) ||
                        /am|pm/i.test(l) ||
                        /jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(l) ||
                        /mon|tue|wed|thu|fri|sat|sun/i.test(l)
                ) || ""
            );
        }

        /**
         * Try to extract a BrokerBay showing detail URL from a row element.
         * Looks for:
         *   1. <a href="#/my_business/showing/..."> inside or on the row
         *   2. ui-sref that references a showing state + id param
         *   3. ng-click that contains a 24-hex showing id
         */
        function extractDetailUrl(row) {
            // 1. Direct href on an <a> tag
            const anchors = row.tagName === "A" ? [row] : Array.from(row.querySelectorAll("a"));
            anchors.unshift(row); // also check the row itself
            for (const a of anchors) {
                const href = a.getAttribute("href") || a.getAttribute("ng-href") || "";
                if (/my_business\/showing\/[a-f0-9]{24}/i.test(href)) {
                    // Normalise: make it a full hash URL
                    const idMatch = href.match(/\/showing\/([a-f0-9]{24})/i);
                    if (idMatch) {
                        return `https://edge.brokerbay.com/#/my_business/showing/${idMatch[1]}?redirectTo=calendar`;
                    }
                }
            }

            // 2. ui-sref attribute
            const allUiSref = [row, ...row.querySelectorAll("[ui-sref]")];
            for (const el of allUiSref) {
                const sref = el.getAttribute("ui-sref") || "";
                const idMatch = sref.match(/['""]([a-f0-9]{24})['"'"]/i);
                if (idMatch) {
                    return `https://edge.brokerbay.com/#/my_business/showing/${idMatch[1]}?redirectTo=calendar`;
                }
            }

            // 3. ng-click containing a MongoDB ObjectId
            const allNgClick = [row, ...row.querySelectorAll("[ng-click]")];
            for (const el of allNgClick) {
                const nc = el.getAttribute("ng-click") || "";
                const idMatch = nc.match(/['"]([a-f0-9]{24})['"]/i);
                if (idMatch) {
                    return `https://edge.brokerbay.com/#/my_business/showing/${idMatch[1]}?redirectTo=calendar`;
                }
            }

            return null;
        }

        // ---- MAIN SCAN ----
        // Find all elements whose trimmed text EXACTLY matches one of the targeted tags.
        // We cast a wide net: any element whose text content is a status badge text.
        const allElements = Array.from(document.querySelectorAll("*"));
        const seenRows = new Set();

        for (const el of allElements) {
            // Only look at "leaf-like" elements (few children) to avoid matching containers
            if (el.children.length > 4) continue;

            const text = (el.textContent || "").trim().toLowerCase();
            if (!targetedTags.includes(text)) continue;

            // Check it's visible
            const rect = el.getBoundingClientRect();
            const isVisible =
                rect.width > 0 &&
                rect.height > 0 &&
                el.offsetParent !== null;
            if (!isVisible) continue;

            // Walk up to the row container
            const row = findRowAncestor(el);
            if (!row) continue;

            // Deduplicate: skip if we've already processed this row container
            if (seenRows.has(row)) continue;
            seenRows.add(row);

            const address = extractAddress(row);
            const dateText = extractDate(row);
            const detailUrl = extractDetailUrl(row);

            found.push({
                address: address.substring(0, 100),
                tag: text,
                dateText: dateText.substring(0, 80),
                detailUrl,
            });
        }

        return found;
    }, { targetedTags: CONFIG.targetedTags });
}

// ========================== FULL PAGINATED SCAN ==========================

/**
 * Scans ALL pagination pages and returns every targeted showing.
 * Optionally filters by address substring.
 *
 * @param {import('puppeteer').Page} page
 * @param {string|null} addressFilter  - lowercase partial address to match
 * @returns {Promise<Array<{address, tag, dateText, detailUrl, pageNum}>>}
 */
async function scanAllPages(page, addressFilter = null) {
    const allShowings = [];

    const totalPages = await getTotalPages(page);
    log(`  📄 Pagination: ${totalPages} page(s) detected`, "dim");

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        if (pageNum > 1) {
            const navigated = await goToPage(page, pageNum);
            if (!navigated) {
                log(`  ⚠️  Could not navigate to page ${pageNum}, skipping`, "yellow");
                continue;
            }
        }

        log(`  🔍 Scanning page ${pageNum}/${totalPages}...`, "dim");
        const showings = await scanCurrentPage(page);

        log(`     Found ${showings.length} targeted showing(s) on page ${pageNum}`, "dim");

        for (const s of showings) {
            if (addressFilter && !s.address.toLowerCase().includes(addressFilter)) continue;
            allShowings.push({ ...s, pageNum });
        }
    }

    return allShowings;
}

// ========================== SHOWING DETAIL NAVIGATION ==========================

/**
 * Navigate to a showing's detail page.
 * If we have a direct URL, navigate to it.
 * If not, click the row on the list page (finding it by address text).
 *
 * Returns the URL we ended up on, or null on failure.
 */
async function navigateToShowingDetail(page, showing) {
    if (showing.detailUrl) {
        log(`  🔗 Navigating directly to: ${showing.detailUrl}`, "dim");
        await page.goto(showing.detailUrl, {
            waitUntil: "domcontentloaded",
            timeout: CONFIG.navigationTimeout,
        });
        await wait(CONFIG.mediumWait);
        return page.url();
    }

    // Fallback: we have to navigate to the list, find the row by address text, click it
    log(`  ⚠️  No direct URL — clicking row by address text: "${showing.address}"`, "yellow");

    await navigateToShowings(page);
    if (showing.pageNum > 1) {
        await goToPage(page, showing.pageNum);
        await wait(CONFIG.mediumWait);
    }

    const urlBefore = page.url();

    // Find the row that contains our address text AND the targeted tag
    const clicked = await page.evaluate(
        ({ address, tag }) => {
            const allElements = Array.from(document.querySelectorAll("*"));
            for (const el of allElements) {
                if (el.children.length > 4) continue;
                const text = (el.textContent || "").trim().toLowerCase();
                if (text !== tag) continue;

                // Walk up to row ancestor
                let row = el.parentElement;
                let depth = 0;
                while (row && depth < 12) {
                    const rowText = (row.textContent || "").toLowerCase();
                    if (rowText.includes(address.toLowerCase())) {
                        row.scrollIntoView({ block: "center" });
                        row.click();
                        return true;
                    }
                    row = row.parentElement;
                    depth++;
                }
            }
            return false;
        },
        { address: showing.address.toLowerCase(), tag: showing.tag }
    );

    if (!clicked) {
        log(`  ❌ Could not find showing row for: ${showing.address}`, "red");
        return null;
    }

    // Wait for the URL to change (Angular SPA navigation)
    try {
        await page.waitForFunction(
            (before) => window.location.href !== before,
            { timeout: 10000 },
            urlBefore
        );
    } catch {
        // May have already navigated — just continue
    }

    await wait(CONFIG.mediumWait);
    return page.url();
}

// ========================== CANCELLATION FLOW ==========================

/**
 * On the showing detail page, perform the full cancellation:
 *  1. Click "Cancel" (the ✕ Cancel button)
 *  2. Wait for the confirmation modal
 *  3. Select "Client is no longer interested" from the reason dropdown
 *  4. Click "Cancel Showing"
 *  5. Verify success
 */
async function performCancellation(page, showing) {
    log(`\n  🚫 Cancelling: "${showing.address}" [${showing.tag}]`, "magenta");

    await wait(CONFIG.mediumWait);

    // Ensure we're on a detail page that has a Cancel button
    const onDetailPage = await page.evaluate(() => {
        const url = window.location.href;
        const body = document.body.innerText || "";
        return (
            url.includes("/showing/") ||
            (body.includes("Cancel") && (body.includes("Reschedule") || body.includes("confirmed") || body.includes("approval")))
        );
    });

    if (!onDetailPage) {
        log(`  ❌ Not on a showing detail page (URL: ${page.url()})`, "red");
        await takeScreenshot(page, "cancel_err_wrong_page");
        return false;
    }

    await takeScreenshot(page, `cancel_01_detail`);

    // ---- Step 1: Click the "Cancel" button (not "Cancel Showing") ----
    log("  🔍 Looking for Cancel button...", "dim");

    const cancelBtnHandle = await page.evaluateHandle(() => {
        const candidates = Array.from(
            document.querySelectorAll('button, a, [role="button"], .btn, span')
        );
        // Match exactly "Cancel" or "✕ Cancel" — NOT "Cancel Showing"
        for (const el of candidates) {
            if (el.offsetParent === null) continue;
            const t = (el.textContent || "").trim();
            if (/^(✕\s*)?cancel$/i.test(t) && !/showing/i.test(t)) return el;
        }
        // Fallback: icon-button with "×" near a "Cancel" label sibling
        for (const el of candidates) {
            if (el.offsetParent === null) continue;
            const t = (el.textContent || "").trim();
            if (t === "×" || t === "✕") return el;
        }
        return null;
    });

    const cancelBtn = cancelBtnHandle.asElement ? cancelBtnHandle.asElement() : null;
    if (!cancelBtn) {
        log("  ❌ Cancel button not found", "red");
        await takeScreenshot(page, "cancel_err_no_cancel_btn");
        return false;
    }

    await clickSafely(page, cancelBtn, "Cancel button");
    await wait(CONFIG.mediumWait);

    // ---- Step 2: Wait for the confirmation modal ----
    log("  🔍 Waiting for confirmation modal...", "dim");
    let modalAppeared = false;

    for (let i = 0; i < 5; i++) {
        const visible = await page.evaluate(() => {
            const body = document.body.innerText || "";
            return (
                body.includes("cancel this showing") ||
                body.includes("Reason for cancelling") ||
                body.includes("Select a reason") ||
                document.querySelector('[class*="modal"], [role="dialog"], .ant-modal, .modal') !== null
            );
        });
        if (visible) { modalAppeared = true; break; }
        await wait(CONFIG.shortWait);
    }

    if (!modalAppeared) {
        log("  ❌ Confirmation modal did not appear", "red");
        await takeScreenshot(page, "cancel_err_no_modal");
        return false;
    }

    log("  ✓ Modal appeared", "dim");
    await takeScreenshot(page, "cancel_02_modal_open");

    // ---- Step 3: Select cancellation reason ----
    log(`  🔍 Selecting reason: "${CONFIG.cancelReason}"`, "dim");
    let reasonSelected = false;

    // Method A: native AngularJS <select> with proper $apply digest
    const nativeSelectResult = await page.evaluate((reason) => {
        const selects = Array.from(document.querySelectorAll("select"));
        for (const sel of selects) {
            if (sel.offsetParent === null) continue;
            for (const opt of sel.options) {
                if (opt.textContent.trim().toLowerCase().includes(reason.toLowerCase())) {
                    sel.value = opt.value;
                    ["input", "change"].forEach((ev) =>
                        sel.dispatchEvent(new Event(ev, { bubbles: true }))
                    );
                    try {
                        const scope =
                            window.angular?.element(sel)?.scope?.() ||
                            window.angular?.element(sel)?.isolateScope?.();
                        if (scope) {
                            const model = sel.getAttribute("ng-model");
                            if (model) {
                                scope.$apply(() => {
                                    const parts = model.split(".");
                                    let obj = scope;
                                    for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
                                    obj[parts[parts.length - 1]] = opt.value;
                                });
                            }
                        }
                    } catch { }
                    return { ok: true, text: opt.textContent.trim() };
                }
            }
        }
        return { ok: false };
    }, CONFIG.cancelReason);

    if (nativeSelectResult.ok) {
        reasonSelected = true;
        log(`  ✓ Selected via native <select>: "${nativeSelectResult.text}"`, "dim");
        await wait(CONFIG.shortWait);
    }

    // Method B: AntD React select — uses Puppeteer real mouse events (JS .click() won't
    // fire React synthetic events, causing the model never to update)
    if (!reasonSelected) {
        log("  ⚠️  Native select not found, trying AntD dropdown with real clicks...", "yellow");

        const triggerSel = [
            ".ant-select-selector",
            ".ant-select:not(.ant-select-disabled) .ant-select-selector",
            '[class*="ant-select"] [class*="selector"]',
            '[role="combobox"]',
        ].join(", ");

        let triggerEl = null;
        for (const sel of triggerSel.split(", ")) {
            try {
                const els = await page.$$(sel);
                for (const el of els) {
                    const visible = await el.evaluate((n) => n.offsetParent !== null);
                    if (visible) { triggerEl = el; break; }
                }
                if (triggerEl) break;
            } catch { }
        }

        if (triggerEl) {
            // Use page.mouse.click with coordinates — immune to stale element handles
            // that occur when Angular re-renders the modal after opening.
            const triggerBox = await triggerEl.boundingBox().catch(() => null);
            if (triggerBox) {
                await page.mouse.click(
                    triggerBox.x + triggerBox.width / 2,
                    triggerBox.y + triggerBox.height / 2
                );
                log("  ✓ Clicked AntD select trigger (mouse coords)", "dim");
            } else {
                await clickSafely(page, triggerEl, "AntD select trigger");
            }

            // AntD v4 uses display:none during open/close animation — do NOT use
            // { visible: true } which blocks on that. Wait for DOM presence only.
            const dropdownInDom = await page
                .waitForSelector(".ant-select-dropdown", { timeout: 4000 })
                .then(() => true)
                .catch(() => false);

            if (dropdownInDom) {
                // Wait one more tick for the animation to finish and items to be clickable
                await wait(300);
                log("  ✓ AntD dropdown in DOM", "dim");

                const optionSels = [
                    ".ant-select-dropdown .ant-select-item-option-content",
                    ".ant-select-dropdown .ant-select-item",
                    ".ant-select-dropdown li",
                    "[role='option']",
                ];

                for (const sel of optionSels) {
                    const opts = await page.$$(sel);
                    let matched = false;
                    for (const opt of opts) {
                        const text = await opt.evaluate((n) => (n.textContent || "").trim()).catch(() => "");
                        if (!text.toLowerCase().includes(CONFIG.cancelReason.toLowerCase())) continue;

                        // Use mouse.click with coords — safest for portalled elements
                        const optBox = await opt.boundingBox().catch(() => null);
                        if (optBox) {
                            await page.mouse.click(
                                optBox.x + optBox.width / 2,
                                optBox.y + optBox.height / 2
                            );
                        } else {
                            await opt.evaluate((n) => n.click());
                        }

                        reasonSelected = true;
                        log(`  ✓ Selected via AntD mouse click: "${text}"`, "dim");
                        matched = true;
                        break;
                    }
                    if (matched) break;
                }
            } else {
                log("  ⚠️  AntD dropdown did not appear — trying keyboard nav", "yellow");
            }

            // Keyboard fallback: ArrowDown to navigate options + Enter to confirm.
            // Works whether the dropdown is open or not (re-opens if needed).
            if (!reasonSelected) {
                log("  ⚠️  Trying keyboard navigation on select...", "yellow");
                await page.keyboard.press("ArrowDown");
                await wait(400);

                // Check if matching text is now highlighted in the dropdown
                const textFound = await page.evaluate((reason) => {
                    const activeOpt = document.querySelector(
                        ".ant-select-item-option-active, .ant-select-item-option-selected, [aria-selected='true']"
                    );
                    if (activeOpt && activeOpt.textContent.toLowerCase().includes(reason.toLowerCase())) {
                        return true;
                    }
                    // Navigate all options looking for the one matching our reason
                    const all = Array.from(document.querySelectorAll(
                        ".ant-select-item, [role='option'], .ant-select-item-option"
                    ));
                    return all.some((el) => el.textContent.toLowerCase().includes(reason.toLowerCase()));
                }, CONFIG.cancelReason);

                if (textFound) {
                    // Keep pressing ArrowDown until the target option is focused
                    for (let i = 0; i < 5; i++) {
                        const isFocused = await page.evaluate((reason) => {
                            const active = document.querySelector(
                                ".ant-select-item-option-active, [aria-selected='true']"
                            );
                            return !!(active && active.textContent.toLowerCase().includes(reason.toLowerCase()));
                        }, CONFIG.cancelReason);

                        if (isFocused) {
                            await page.keyboard.press("Enter");
                            reasonSelected = true;
                            log("  ✓ Selected via keyboard ArrowDown + Enter", "dim");
                            break;
                        }
                        await page.keyboard.press("ArrowDown");
                        await wait(200);
                    }
                }
            }
        }

        if (!reasonSelected) {
            await wait(CONFIG.shortWait);
        }
    }

    // Method C: AngularJS scope force-set — directly mutate the model through $apply
    if (!reasonSelected) {
        log("  ⚠️  AntD method failed, trying Angular scope injection...", "yellow");
        const scopeResult = await page.evaluate((reason) => {
            if (!window.angular) return { ok: false };
            const allInputs = Array.from(document.querySelectorAll(
                "[ng-model], select, [ng-change], [class*='select'], [role='combobox']"
            ));
            for (const el of allInputs) {
                if (el.offsetParent === null) continue;
                try {
                    const scope =
                        window.angular.element(el).scope() ||
                        window.angular.element(el).isolateScope();
                    if (!scope) continue;
                    const model = el.getAttribute("ng-model") || "cancellationReason";
                    scope.$apply(() => {
                        const parts = model.split(".");
                        let obj = scope;
                        for (let i = 0; i < parts.length - 1; i++) {
                            if (!obj[parts[i]]) obj[parts[i]] = {};
                            obj = obj[parts[i]];
                        }
                        obj[parts[parts.length - 1]] = reason;
                    });
                    return { ok: true };
                } catch { }
            }
            return { ok: false };
        }, CONFIG.cancelReason);

        if (scopeResult.ok) {
            reasonSelected = true;
            log("  ✓ Reason injected via Angular scope", "dim");
            await wait(CONFIG.shortWait);
        }
    }

    // Method D: last-resort direct text click (only within visible modal context)
    if (!reasonSelected) {
        log("  ⚠️  Scope injection failed, trying modal-scoped text click...", "yellow");
        const directClicked = await page.evaluate((reason) => {
            const modal = document.querySelector(
                '.ant-modal-body, [class*="modal-body"], [class*="modal-content"], [role="dialog"]'
            );
            const searchRoot = modal || document.body;
            const all = Array.from(searchRoot.querySelectorAll("li, div, span, option"));
            for (const el of all) {
                if (el.offsetParent === null) continue;
                if (el.children.length > 3) continue;
                const t = (el.textContent || "").trim();
                if (t.toLowerCase().includes(reason.toLowerCase())) {
                    el.click();
                    return { ok: true, text: t };
                }
            }
            return { ok: false };
        }, CONFIG.cancelReason);

        if (directClicked.ok) {
            reasonSelected = true;
            log(`  ✓ Selected via modal text click: "${directClicked.text}"`, "dim");
            await wait(CONFIG.shortWait);
        }
    }

    if (!reasonSelected) {
        log("  ❌ Could not select cancellation reason", "red");
        await takeScreenshot(page, "cancel_err_no_reason");
        await dismissModalIfOpen(page);
        return false;
    }

    await takeScreenshot(page, "cancel_03_reason_selected");

    // ---- Step 4: Wait for "Cancel Showing" button to become enabled, then click ----
    log('  🔍 Waiting for "Cancel Showing" button to become enabled...', "dim");

    let confirmBtn = null;
    for (let attempt = 0; attempt < 8; attempt++) {
        const handle = await page.evaluateHandle(() => {
            const candidates = Array.from(document.querySelectorAll(
                'button, a, [role="button"], input[type="submit"]'
            ));
            for (const el of candidates) {
                if (el.offsetParent === null) continue;
                const t = (el.textContent || el.value || "").trim().toLowerCase();
                if (!t.includes("cancel showing")) continue;
                if (!el.disabled && !el.classList.contains("disabled") &&
                    !el.getAttribute("disabled") && !el.classList.contains("ant-btn-disabled")) {
                    return el;
                }
            }
            return null;
        });
        const el = handle.asElement ? handle.asElement() : null;
        if (el) { confirmBtn = el; break; }
        await wait(500);
    }

    if (!confirmBtn) {
        log('  ❌ "Cancel Showing" button never became enabled — reason was not applied', "red");
        await takeScreenshot(page, "cancel_err_btn_disabled");
        await dismissModalIfOpen(page);
        return false;
    }

    log('  ✓ "Cancel Showing" button is enabled', "dim");
    await clickSafely(page, confirmBtn, '"Cancel Showing" confirm button');
    await wait(CONFIG.mediumWait);

    // ---- Step 5: Verify cancellation ----
    log("  🔍 Verifying cancellation...", "dim");
    let confirmed = false;
    for (let i = 0; i < 6; i++) {
        const result = await page.evaluate(() => {
            const body = (document.body.innerText || "").toLowerCase();
            const url = window.location.href;
            // Text-based confirmation
            if (
                body.includes("showing cancelled") ||
                body.includes("has been cancelled") ||
                body.includes("successfully cancelled") ||
                body.includes("cancellation confirmed")
            ) return "text";
            // Badge changed to Cancelled
            const allEls = Array.from(document.querySelectorAll("*"));
            for (const el of allEls) {
                if (el.children.length > 2) continue;
                if ((el.textContent || "").trim().toLowerCase() === "cancelled" && el.offsetParent !== null)
                    return "badge";
            }
            // Modal closed and we're back on detail (showing was cancelled in place)
            if (url.includes("/showing/") && !document.querySelector('[class*="modal"], [role="dialog"]'))
                return "modal_closed";
            return null;
        });

        if (result) {
            confirmed = true;
            log(`  ✅ Cancellation confirmed (signal: ${result})`, "green");
            break;
        }
        await wait(CONFIG.shortWait);
    }

    if (!confirmed) {
        log("  ⚠️  Could not detect cancellation confirmation — proceeding", "yellow");
    }

    await takeScreenshot(page, "cancel_04_done");
    return true;
}

// ========================== EXPORTED API FOR WORKER ==========================

/**
 * Run a cancellation sweep using a pre-existing browser instance.
 * Called from auto-booking-worker.js after all queued bookings are done.
 *
 * @param {import('puppeteer').Browser} browser
 * @param {Object} [options]
 * @param {boolean} [options.dryRun=false]
 * @param {string|null} [options.addressFilter=null] - lowercase partial address
 * @returns {Promise<{cancelled: number, failed: number, scanned: number, errors: string[]}>}
 */
export async function runCancellationSweep(browser, options = {}) {
    const { dryRun = false, addressFilter = null } = options;
    let page = null;

    const stats = { scanned: 0, cancelled: 0, skipped: 0, failed: 0, errors: [] };

    try {
        log(`\n${"═".repeat(70)}`, "bright");
        log("  🚫  [CANCEL] Cancellation Sweep Starting", "bright");
        log(`${"═".repeat(70)}`, "bright");
        if (dryRun) log("  ⚡ DRY RUN — no actual cancellations", "yellow");
        if (addressFilter) log(`  🎯 Address filter: "${addressFilter}"`, "cyan");

        // Get or create a page
        const useExistingTab = browser.isConnectedToExisting || browser._sessionReady;
        if (useExistingTab) {
            const pages = await browser.pages();
            const bbPage = pages.find(
                (p) => p.url().includes("edge.brokerbay.com") && !p.url().includes("auth.brokerbay.com")
            );
            if (bbPage) {
                page = bbPage;
                try { await page.bringToFront(); } catch { }
            } else {
                page = await browser.newPage();
            }
        } else {
            const pages = await browser.pages();
            page = pages.length > 0 ? pages[0] : await browser.newPage();

            // Session check
            if (!page.url().includes("brokerbay.com")) {
                await page.goto("https://edge.brokerbay.com/#/my_business", {
                    waitUntil: "domcontentloaded",
                    timeout: CONFIG.navigationTimeout,
                });
                await wait(3000);
            }
            const sessionOk = await isSessionValid(page);
            if (!sessionOk) {
                log("  ❌ [CANCEL] Session expired — re-export and re-deploy.", "red");
                stats.errors.push("Session expired");
                return stats;
            }
        }

        await page.setViewport(CONFIG.viewport);

        // Navigate to the showings list
        await navigateToShowings(page);

        // One-pass scan of all pages
        const targeted = await scanAllPages(page, addressFilter);
        stats.scanned = targeted.length;

        log(`\n  📋 Found ${targeted.length} targeted showing(s)`, targeted.length > 0 ? "cyan" : "dim");
        targeted.forEach((s, i) =>
            log(`     ${i + 1}. [${s.tag.toUpperCase()}] ${s.address}${s.detailUrl ? "" : " (no direct URL — will click row)"}`, "white")
        );

        if (targeted.length === 0) {
            log("  ✅ Nothing to cancel.", "green");
            return stats;
        }

        if (dryRun) {
            stats.skipped = targeted.length;
            log("\n  ⚡ Dry-run complete — no cancellations performed.", "yellow");
            return stats;
        }

        // Cancel each showing individually
        for (const showing of targeted) {
            log(`\n${"─".repeat(60)}`, "dim");
            log(`  🎯 [${showing.tag.toUpperCase()}] ${showing.address}`, "cyan");
            log(`     Date: ${showing.dateText || "N/A"}  |  Page: ${showing.pageNum}`, "dim");

            // Navigate to detail page
            const detailUrl = await navigateToShowingDetail(page, showing);
            if (!detailUrl || !detailUrl.includes("/showing/")) {
                log(`  ❌ Failed to reach detail page for: ${showing.address}`, "red");
                stats.failed++;
                stats.errors.push(`Detail nav failed: ${showing.address}`);
                // Go back to list for next iteration
                await navigateToShowings(page);
                continue;
            }

            const success = await performCancellation(page, showing);

            if (success) {
                stats.cancelled++;
                log(`  ✅ Cancelled (${stats.cancelled} total so far)`, "green");
            } else {
                stats.failed++;
                stats.errors.push(`Cancel failed: ${showing.address}`);
            }

            // Small pause between cancellations to avoid rate-limiting
            await wait(CONFIG.mediumWait);

            // Return to list for next iteration
            await navigateToShowings(page);
        }

        // ---- Summary ----
        log(`\n${"═".repeat(70)}`, "bright");
        log("  📊  [CANCEL] SWEEP SUMMARY", "bright");
        log(`${"═".repeat(70)}`, "bright");
        log(`  Scanned  : ${stats.scanned}`, "white");
        log(`  Cancelled: ${stats.cancelled}`, "green");
        log(`  Failed   : ${stats.failed}`, stats.failed > 0 ? "red" : "white");
        if (stats.errors.length > 0) {
            stats.errors.forEach((e, i) => log(`    ${i + 1}. ${e}`, "red"));
        }
        log(`${"═".repeat(70)}\n`, "bright");

    } catch (err) {
        log(`  ❌ [CANCEL] Sweep error: ${err.message}`, "red");
        stats.errors.push(`Fatal: ${err.message}`);
        if (page) await takeScreenshot(page, "cancel_sweep_fatal");
    }

    return stats;
}

// ========================== CLI ENTRY POINT ==========================

async function main() {
    log("\n" + "═".repeat(70), "bright");
    log("  🚫  AUTO-CANCEL SHOWINGS", "bright");
    log("═".repeat(70), "bright");
    if (DRY_RUN) log("  ⚡ DRY RUN MODE — no cancellations will be performed\n", "yellow");
    if (TARGET_ADDRESS) log(`  🎯 Address filter: "${TARGET_ADDRESS}"\n`, "cyan");
    log(`  Targets  : ${CONFIG.targetedTags.join(", ")}`, "dim");
    log(`  Reason   : ${CONFIG.cancelReason}`, "dim");
    log(`  Base URL : ${CONFIG.showingsUrl}\n`, "dim");

    let browser = null;

    try {
        browser = await launchWithSession({
            headless: process.env.HEADLESS !== "false",
            defaultViewport: CONFIG.viewport,
        });

        await runCancellationSweep(browser, {
            dryRun: DRY_RUN,
            addressFilter: TARGET_ADDRESS,
        });

    } catch (err) {
        log(`\n❌ FATAL: ${err.message}`, "red");
        log(err.stack, "dim");
    } finally {
        if (browser) {
            try {
                if (browser.isConnectedToExisting) {
                    browser.disconnect();
                    log("  ℹ️  Disconnected from existing browser (kept open)", "dim");
                } else {
                    await browser.close();
                }
            } catch { }
        }
    }
}

if (_isMainModule) {
    main().catch((err) => {
        console.error("\n💥 Unhandled error:", err);
        process.exit(1);
    });
}
