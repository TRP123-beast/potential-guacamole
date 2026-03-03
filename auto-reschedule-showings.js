#!/usr/bin/env node

/**
 * ============================================================================
 *  AUTO-RESCHEDULE SHOWINGS  (v1)
 * ============================================================================
 *
 *  CLI usage:
 *    node auto-reschedule-showings.js \
 *      --date 2026-03-10 --time "2:00 PM" --duration 45
 *
 *    node auto-reschedule-showings.js "37 Dee Avenue" \
 *      --date 2026-03-10 --time "10:00 AM" --duration 30
 *
 *    node auto-reschedule-showings.js --dry-run \
 *      --date 2026-03-15 --time "11:00 AM"
 *
 *  Targeted status : Confirmed ONLY
 *  Flow per showing:
 *    1. Navigate to the Confirmed showing's detail page
 *    2. Read the original date / time / duration from the left panel
 *    3. Validate that the requested new date ≥ original date
 *    4. Click "Reschedule" button  →  /appointments/{id}/time_change URL
 *    5. Select new date (calendar), duration (radio/button), time slot
 *    6. Click "Book Showing" to submit
 *    7. Verify success
 *
 *  Calendar / time / duration logic is ported from auto-book-enhanced.js.
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
    targetedTags: ["confirmed"],
};

// ========================== CLI ARG PARSING ==========================
const rawArgs = process.argv.slice(2);
const DRY_RUN = rawArgs.includes("--dry-run");

function getArgValue(flag) {
    const idx = rawArgs.indexOf(flag);
    return idx !== -1 && rawArgs[idx + 1] ? rawArgs[idx + 1].trim() : null;
}

const NEW_DATE = getArgValue("--date");
const NEW_TIME = getArgValue("--time");
const NEW_DURATION = getArgValue("--duration") ? parseInt(getArgValue("--duration"), 10) : null;
const positional = rawArgs.filter((a) => !a.startsWith("--") && a !== getArgValue("--date") && a !== getArgValue("--time") && a !== getArgValue("--duration"));
const TARGET_ADDRESS = positional.length > 0 ? positional[0].trim().toLowerCase() : null;

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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ========================== HELPERS ==========================
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
 * Scroll an element into view and click it, with three fallback strategies.
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
            return (
                body.includes("Confirmed") ||
                body.includes("Awaiting Approval") ||
                body.includes("Pending") ||
                body.includes("Cancelled") ||
                body.includes("No showings") ||
                body.includes("no results")
            );
        });
        if (ready) return true;
        await wait(800);
    }
    return false;
}

async function navigateToShowings(page) {
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

async function getTotalPages(page) {
    return page.evaluate(() => {
        const selectors = [
            "ul.pagination li a", ".pagination a",
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
        const body = document.body.innerText || "";
        const match = body.match(/page\s+\d+\s+of\s+(\d+)/i);
        if (match) return parseInt(match[1], 10);
        return 1;
    });
}

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

// ========================== SCAN ==========================

/**
 * Scans the current page for "Confirmed" showings.
 * Returns: { address, tag, dateText, detailUrl }[]
 */
async function scanCurrentPage(page) {
    return page.evaluate((config) => {
        const { targetedTags } = config;
        const found = [];

        function containsStreetAddress(node) {
            const text = node.innerText || node.textContent || "";
            return /\b\d+[a-zA-Z]?\s+[A-Za-z]{2,}/.test(text) && text.trim().length > 30;
        }

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
                    if (containsStreetAddress(node)) return node;
                    if (!fallback) fallback = node;
                }
                node = node.parentElement;
                depth++;
            }
            return fallback;
        }

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

        function extractDate(container) {
            const raw = container.innerText || container.textContent || "";
            const lines = raw.split(/[\n\r]+/).map((l) => l.trim()).filter((l) => l.length > 3);
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

        function extractDetailUrl(row) {
            const anchors = row.tagName === "A" ? [row] : Array.from(row.querySelectorAll("a"));
            anchors.unshift(row);
            for (const a of anchors) {
                const href = a.getAttribute("href") || a.getAttribute("ng-href") || "";
                if (/my_business\/showing\/[a-f0-9]{24}/i.test(href)) {
                    const idMatch = href.match(/\/showing\/([a-f0-9]{24})/i);
                    if (idMatch) {
                        return `https://edge.brokerbay.com/#/my_business/showing/${idMatch[1]}?redirectTo=calendar`;
                    }
                }
            }
            const allUiSref = [row, ...row.querySelectorAll("[ui-sref]")];
            for (const el of allUiSref) {
                const sref = el.getAttribute("ui-sref") || "";
                const idMatch = sref.match(/['""]([a-f0-9]{24})['"'"]/i);
                if (idMatch) {
                    return `https://edge.brokerbay.com/#/my_business/showing/${idMatch[1]}?redirectTo=calendar`;
                }
            }
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

        const allElements = Array.from(document.querySelectorAll("*"));
        const seenRows = new Set();

        for (const el of allElements) {
            if (el.children.length > 4) continue;
            const text = (el.textContent || "").trim().toLowerCase();
            if (!targetedTags.includes(text)) continue;
            const rect = el.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0 && el.offsetParent !== null;
            if (!isVisible) continue;
            const row = findRowAncestor(el);
            if (!row) continue;
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
        log(`     Found ${showings.length} confirmed showing(s) on page ${pageNum}`, "dim");
        for (const s of showings) {
            if (addressFilter && !s.address.toLowerCase().includes(addressFilter)) continue;
            allShowings.push({ ...s, pageNum });
        }
    }

    return allShowings;
}

// ========================== DETAIL NAVIGATION ==========================

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

    log(`  ⚠️  No direct URL — clicking row by address text: "${showing.address}"`, "yellow");
    await navigateToShowings(page);
    if (showing.pageNum > 1) {
        await goToPage(page, showing.pageNum);
        await wait(CONFIG.mediumWait);
    }

    const urlBefore = page.url();
    const clicked = await page.evaluate(
        ({ address, tag }) => {
            const allElements = Array.from(document.querySelectorAll("*"));
            for (const el of allElements) {
                if (el.children.length > 4) continue;
                const text = (el.textContent || "").trim().toLowerCase();
                if (text !== tag) continue;
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

    try {
        await page.waitForFunction(
            (before) => window.location.href !== before,
            { timeout: 10000 },
            urlBefore
        );
    } catch { }

    await wait(CONFIG.mediumWait);
    return page.url();
}

// ========================== EXTRACT ORIGINAL BOOKING INFO ==========================

/**
 * Reads the original showing details from the showing detail page left panel.
 * Returns { date: Date|null, dateText: string, timeText: string, durationText: string }
 */
async function extractOriginalBookingInfo(page) {
    return page.evaluate(() => {
        const body = document.body.innerText || "";

        const parsedDate = (() => {
            const dateMatch = body.match(
                /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?[,\s]+(\d{4})\b/i
            );
            if (dateMatch) {
                return new Date(`${dateMatch[1]} ${dateMatch[2]}, ${dateMatch[3]}`);
            }
            const numericMatch = body.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/);
            if (numericMatch) {
                const [, m, d, y] = numericMatch;
                const fullYear = y.length === 2 ? 2000 + parseInt(y, 10) : parseInt(y, 10);
                return new Date(fullYear, parseInt(m, 10) - 1, parseInt(d, 10));
            }
            return null;
        })();

        const dateText = (() => {
            const lines = body.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
            return (
                lines.find((l) =>
                    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(l) ||
                    /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/.test(l)
                ) || ""
            );
        })();

        const timeText = (() => {
            const lines = body.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
            return (
                lines.find((l) => /\d{1,2}:\d{2}\s*(am|pm)/i.test(l)) || ""
            );
        })();

        const durationText = (() => {
            const lines = body.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
            return (
                lines.find((l) => /\d+\s*(min|minute|hour)/i.test(l)) || ""
            );
        })();

        return {
            dateIso: parsedDate ? parsedDate.toISOString() : null,
            dateText,
            timeText,
            durationText,
        };
    });
}

// ========================== DATE VALIDATION ==========================

/**
 * Returns { valid: boolean, reason: string|null }
 * The new date must be >= the original booking date AND >= today.
 */
function validateRescheduleDate(newDateStr, originalDateIso) {
    if (!newDateStr) return { valid: true, reason: null };

    const newDate = new Date(newDateStr + "T00:00:00");
    if (isNaN(newDate.getTime())) {
        return { valid: false, reason: `"${newDateStr}" is not a valid date (expected YYYY-MM-DD)` };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (newDate < today) {
        return {
            valid: false,
            reason: `New date ${newDateStr} is in the past (today is ${today.toDateString()})`,
        };
    }

    if (originalDateIso) {
        const originalDate = new Date(originalDateIso);
        originalDate.setHours(0, 0, 0, 0);
        if (newDate < originalDate) {
            return {
                valid: false,
                reason: `New date ${newDateStr} is before the original booking date (${originalDate.toDateString()})`,
            };
        }
    }

    return { valid: true, reason: null };
}

// ========================== RESCHEDULE BUTTON ==========================

async function clickRescheduleButton(page) {
    log("  🔍 Looking for Reschedule button...", "dim");

    const rescheduleHandle = await page.evaluateHandle(() => {
        const candidates = Array.from(
            document.querySelectorAll('button, a, [role="button"], .btn, span')
        );
        for (const el of candidates) {
            if (el.offsetParent === null) continue;
            const t = (el.textContent || "").trim().toLowerCase();
            if (t === "reschedule" || t === "modify" || t === "change time" || t === "modify booking") {
                return el;
            }
        }
        for (const el of candidates) {
            if (el.offsetParent === null) continue;
            const t = (el.textContent || "").trim().toLowerCase();
            if (t.includes("reschedule") || t.includes("modify")) return el;
        }
        return null;
    });

    const rescheduleBtn = rescheduleHandle.asElement ? rescheduleHandle.asElement() : null;

    if (!rescheduleBtn) {
        log("  ❌ Reschedule button not found on detail page", "red");
        await takeScreenshot(page, "reschedule_err_no_btn");
        return false;
    }

    await clickSafely(page, rescheduleBtn, "Reschedule button");
    await wait(CONFIG.mediumWait);

    const onModifyPage = await page.evaluate(() => {
        const url = window.location.href;
        const body = document.body.innerText || "";
        return (
            url.includes("/time_change") ||
            url.includes("/appointments/") ||
            body.toLowerCase().includes("original showing") ||
            body.toLowerCase().includes("select date") ||
            body.toLowerCase().includes("modify showing") ||
            body.toLowerCase().includes("step 1")
        );
    });

    if (!onModifyPage) {
        log(`  ⚠️  May not have reached modify page (URL: ${page.url()})`, "yellow");
        await takeScreenshot(page, "reschedule_warn_not_modify_page");
    } else {
        log(`  ✓ Modify page loaded: ${page.url()}`, "dim");
    }

    await wait(CONFIG.longWait);
    return true;
}

// ========================== SELECT DATE (ported from auto-book-enhanced.js) ==========================

async function selectDateOnModifyPage(page, newDateStr) {
    if (!newDateStr) {
        log("  ℹ️  No preferred date provided — leaving calendar as-is", "dim");
        return true;
    }

    log(`  📅 Selecting new date: ${newDateStr}`, "cyan");

    const now = new Date();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let dayToSelect, targetMonth, targetYear;

    try {
        const dateObj = new Date(newDateStr + "T00:00:00");
        if (isNaN(dateObj.getTime())) throw new Error("Invalid date");
        dayToSelect = dateObj.getDate();
        targetMonth = dateObj.getMonth();
        targetYear = dateObj.getFullYear();
    } catch {
        log(`  ⚠️  Could not parse date "${newDateStr}", using today`, "yellow");
        dayToSelect = currentDay;
        targetMonth = currentMonth;
        targetYear = currentYear;
    }

    const totalMonthDiff = (targetYear - currentYear) * 12 + (targetMonth - currentMonth);

    if (Math.abs(totalMonthDiff) > 6) {
        log(`  ⚠️  Date "${newDateStr}" is too far away (${totalMonthDiff} months). Using today.`, "yellow");
        dayToSelect = currentDay;
    } else if (totalMonthDiff !== 0) {
        log(`  🔀 Navigating calendar ${totalMonthDiff} month(s)...`, "dim");
        const isForward = totalMonthDiff > 0;
        const steps = Math.abs(totalMonthDiff);

        const arrowSelectors = isForward
            ? [
                ".bb-calendar__nav-right",
                'button[aria-label*="Next"]', 'button[aria-label*="next"]',
                ".fc-next-button", ".calendar-nav .next",
                '[ng-click*="nextMonth"]', '[ng-click*="next"]',
                ".calendar-header button:last-child",
            ]
            : [
                ".bb-calendar__nav-left",
                'button[aria-label*="Prev"]', 'button[aria-label*="prev"]',
                ".fc-prev-button", ".calendar-nav .prev",
                '[ng-click*="prevMonth"]', '[ng-click*="prev"]',
                ".calendar-header button:first-child",
            ];

        for (let i = 0; i < steps; i++) {
            let clicked = false;
            for (const sel of arrowSelectors) {
                const btn = await page.$(sel);
                if (btn) {
                    await btn.click();
                    clicked = true;
                    log(`  ✓ Month ${isForward ? "next" : "prev"} arrow clicked (step ${i + 1}/${steps})`, "dim");
                    break;
                }
            }
            if (!clicked) {
                const arrowClicked = await page.evaluate((forward) => {
                    const buttons = Array.from(document.querySelectorAll('button, a, span[role="button"]'));
                    const arrowChars = forward ? ["›", ">", "▶", "»", "next"] : ["‹", "<", "◀", "«", "prev"];
                    for (const btn of buttons) {
                        const text = (btn.textContent || btn.innerText || "").trim().toLowerCase();
                        if (arrowChars.some((c) => text === c || text.includes(c))) {
                            btn.click();
                            return true;
                        }
                    }
                    return false;
                }, isForward);
                if (arrowClicked) {
                    clicked = true;
                    log(`  ✓ Month arrow clicked via text match (step ${i + 1}/${steps})`, "dim");
                }
            }
            if (!clicked) {
                log(`  ⚠️  Could not find calendar arrow. Proceeding with current month.`, "yellow");
                break;
            }
            await wait(1000);
        }
    }

    log(`  🔍 Clicking day ${dayToSelect} in calendar...`, "dim");
    await wait(1000);

    const result = await page.evaluate((targetDayStr) => {
        const targetDay = parseInt(targetDayStr, 10);
        if (Number.isNaN(targetDay)) return { success: false, reason: "Invalid day number" };

        const normalizeCellDay = (el) => {
            const aria = el.getAttribute("aria-label") || "";
            const ariaMatch = aria.match(/\b(\d{1,2})\b/);
            if (ariaMatch) return parseInt(ariaMatch[1], 10);
            const dataDate = el.getAttribute("data-date") || el.getAttribute("data-day");
            if (dataDate) {
                const parsed = parseInt(dataDate, 10);
                if (!isNaN(parsed)) return parsed;
            }
            const text = (el.textContent || el.innerText || "").trim();
            const textMatch = text.match(/^\s*(\d{1,2})\s*$/);
            if (textMatch) return parseInt(textMatch[1], 10);
            return NaN;
        };

        const isDisabled = (el) => {
            if (el.disabled || el.getAttribute("aria-disabled") === "true") return true;
            const cls = el.className || "";
            if (cls.includes("disabled") || cls.includes("old") || cls.includes("new")) return true;
            const s = window.getComputedStyle(el);
            if (s.pointerEvents === "none" || s.opacity === "0" || s.visibility === "hidden") return true;
            return false;
        };

        const tryClick = (el) => {
            try {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                el.click();
                el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
                el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
                el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
                return true;
            } catch { return false; }
        };

        const strategies = [
            ['[class*="bb-calendar"] td', null],
            ['[class*="bb-calendar"] span', null],
            ['[class*="bb-calendar"] div', null],
            ['[class*="bb-calendar"] a', null],
            ['[class*="appointment"] td', null],
            ["td.day:not(.disabled):not(.old):not(.new)", "button"],
            ["td.day:not(.disabled):not(.old):not(.new)", null],
            ["button.day:not(.disabled):not(.old):not(.new)", null],
            ['td[class*="day"]:not([class*="disabled"])', null],
            ['[role="gridcell"]', "button"],
            ['[role="gridcell"]', null],
            ["td.day", null],
            [".calendar-day", null],
        ];

        for (const [parentSel, childSel] of strategies) {
            const parents = Array.from(document.querySelectorAll(parentSel));
            for (const parent of parents) {
                const candidates = childSel ? Array.from(parent.querySelectorAll(childSel)) : [parent];
                for (const el of candidates) {
                    const cellDay = normalizeCellDay(childSel ? parent : el);
                    if (!Number.isNaN(cellDay) && cellDay === targetDay) {
                        if (isDisabled(el) || isDisabled(parent)) continue;
                        if (tryClick(el)) {
                            return { success: true, day: cellDay, selector: parentSel };
                        }
                    }
                }
            }
        }

        const calendarContainers = Array.from(
            document.querySelectorAll('[class*="calendar"], [class*="date"], [class*="appointment"], table')
        );
        const containers = calendarContainers.length > 0 ? calendarContainers : [document.body];
        for (const container of containers) {
            const allEls = Array.from(container.querySelectorAll("td, th, span, div, a, button, p"));
            for (const el of allEls) {
                const text = (el.textContent || el.innerText || "").trim();
                if (!/^\d{1,2}$/.test(text)) continue;
                if (parseInt(text, 10) !== targetDay) continue;
                if (el.children.length > 3) continue;
                const rect = el.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;
                const style = window.getComputedStyle(el);
                if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
                if (isDisabled(el)) continue;
                if (tryClick(el)) {
                    return { success: true, day: targetDay, selector: "nuclear-fallback" };
                }
            }
        }

        return { success: false, reason: `Day ${targetDay} not found or all disabled` };
    }, dayToSelect.toString());

    if (result.success) {
        log(`  ✅ Date day ${result.day} selected (via ${result.selector})`, "green");
        await wait(2000);
        return true;
    }

    log(`  ⚠️  Could not click day ${dayToSelect}: ${result.reason}`, "yellow");
    await takeScreenshot(page, "reschedule_warn_date_click");
    return false;
}

// ========================== SELECT DURATION ==========================

async function selectDuration(page, preferredDuration) {
    if (!preferredDuration) return null;

    log(`  ⏱️  Selecting duration: ${preferredDuration} min`, "dim");

    const parseMinutes = (text) => {
        const m = (text || "").match(/(\d{1,3})\s*min/i);
        return m ? parseInt(m[1], 10) : null;
    };

    const readAvailable = async () => {
        return page.evaluate(() => {
            const parseMin = (t) => {
                const m = (t || "").match(/(\d{1,3})\s*min/i);
                return m ? parseInt(m[1], 10) : null;
            };
            const opts = [];
            const seen = new Set();
            Array.from(document.querySelectorAll('input[type="radio"]')).forEach((inp) => {
                const labelEl = inp.closest("label") || (inp.id ? document.querySelector(`label[for="${inp.id}"]`) : null);
                const labelText = (labelEl?.textContent || "").trim();
                const blob = `${inp.name || ""} ${inp.id || ""} ${inp.className || ""}`.toLowerCase();
                const valInput = parseInt(inp.value, 10);
                const valLabel = parseMin(labelText);
                const minutes = Number.isFinite(valInput) ? valInput : valLabel;
                if (!minutes) return;
                if (!/duration|length|min/.test(blob + " " + labelText.toLowerCase())) return;
                if (seen.has(minutes)) return;
                seen.add(minutes);
                opts.push({ minutes, disabled: inp.disabled || inp.getAttribute("aria-disabled") === "true" });
            });
            Array.from(document.querySelectorAll("button")).forEach((btn) => {
                const minutes = parseMin(btn.textContent || "");
                if (!minutes || seen.has(minutes)) return;
                seen.add(minutes);
                opts.push({ minutes, disabled: btn.disabled || btn.getAttribute("aria-disabled") === "true" });
            });
            return opts;
        });
    };

    const options = await readAvailable();
    const available = options.filter((o) => !o.disabled).map((o) => o.minutes).sort((a, b) => a - b);

    if (!available.length) {
        log("  ⚠️  No duration options found", "yellow");
        return null;
    }

    let selected = preferredDuration;
    if (preferredDuration < available[0]) selected = available[0];
    else if (preferredDuration > available[available.length - 1]) selected = available[available.length - 1];
    else if (!available.includes(preferredDuration)) {
        selected = available.reduce((best, cur) =>
            Math.abs(cur - preferredDuration) < Math.abs(best - preferredDuration) ? cur : best
        , available[0]);
    }

    if (selected !== preferredDuration) {
        log(`  ⚠️  Preferred ${preferredDuration} min not available — selecting closest: ${selected} min`, "yellow");
        log(`     Available: [${available.join(", ")}] min`, "dim");
    }

    const clicked = await page.evaluate((target) => {
        const parseMin = (t) => {
            const m = (t || "").match(/(\d{1,3})\s*min/i);
            return m ? parseInt(m[1], 10) : null;
        };
        for (const inp of Array.from(document.querySelectorAll('input[type="radio"]'))) {
            const labelEl = inp.closest("label") || (inp.id ? document.querySelector(`label[for="${inp.id}"]`) : null);
            const labelText = (labelEl?.textContent || "").trim();
            const valInput = parseInt(inp.value, 10);
            const valLabel = parseMin(labelText);
            const minutes = Number.isFinite(valInput) ? valInput : valLabel;
            if (minutes === target && !inp.disabled && inp.getAttribute("aria-disabled") !== "true") {
                inp.click();
                inp.dispatchEvent(new MouseEvent("click", { bubbles: true }));
                return true;
            }
        }
        for (const btn of Array.from(document.querySelectorAll("button"))) {
            const minutes = parseMin(btn.textContent || "");
            if (minutes === target && !btn.disabled && btn.getAttribute("aria-disabled") !== "true") {
                btn.click();
                btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
                return true;
            }
        }
        return false;
    }, selected);

    if (clicked) {
        log(`  ✅ Duration selected: ${selected} min`, "green");
        await wait(600);
    } else {
        log(`  ⚠️  Could not click duration option for ${selected} min`, "yellow");
    }

    return selected;
}

// ========================== SELECT TIME SLOT ==========================

function parseTimeToMinutes(label) {
    if (!label) return null;
    const lower = label.toLowerCase();
    const match = lower.match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    let hour = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const isPm = lower.includes("pm");
    const isAm = lower.includes("am");
    if (isPm && hour < 12) hour += 12;
    if (isAm && hour === 12) hour = 0;
    if (!isPm && !isAm && hour >= 1 && hour <= 6) hour += 12;
    return hour * 60 + minutes;
}

async function selectTimeSlot(page, preferredTime) {
    log(`  ⏰ Selecting time slot${preferredTime ? `: ${preferredTime}` : " (auto)"}`, "cyan");
    await wait(1500);

    const timeSlotSelectors = [
        'button[class*="time"]:not([disabled])',
        ".time-slot:not(.disabled)",
        '[class*="slot"]:not([disabled])',
        'div[class*="time"]',
        'button[ng-click*="time"]',
    ];

    let allSlots = [];

    for (const selector of timeSlotSelectors) {
        try {
            const elements = await page.$$(selector);
            if (!elements.length) continue;

            const slotData = [];
            for (const el of elements) {
                try {
                    const info = await page.evaluate((e) => {
                        if (e.offsetParent === null) return null;
                        const text = (e.textContent || e.innerText || "").trim();
                        if (!text || e.disabled) return null;
                        const style = window.getComputedStyle(e);
                        if (style.display === "none" || style.visibility === "hidden") return null;
                        return { text };
                    }, el);
                    if (info) slotData.push({ el, text: info.text });
                } catch { }
            }

            if (slotData.length > 0) {
                allSlots = slotData;
                log(`  ✓ Found ${slotData.length} time slots via "${selector}"`, "dim");
                break;
            }
        } catch { }
    }

    if (!allSlots.length) {
        log("  ⚠️  No time slots found — taking screenshot and proceeding", "yellow");
        await takeScreenshot(page, "reschedule_warn_no_time_slots");
        return null;
    }

    let targetSlot = null;

    if (preferredTime) {
        const prefMinutes = parseTimeToMinutes(preferredTime);
        if (prefMinutes !== null) {
            let bestDelta = Infinity;
            for (const slot of allSlots) {
                const m = parseTimeToMinutes(slot.text);
                if (m == null || m < prefMinutes) continue;
                const delta = m - prefMinutes;
                if (delta < bestDelta) {
                    targetSlot = slot;
                    bestDelta = delta;
                }
            }
            if (!targetSlot) {
                log(`  ⚠️  No slot at/after "${preferredTime}", taking earliest available`, "yellow");
                targetSlot = allSlots[0];
            }
        } else {
            log(`  ⚠️  Could not parse preferred time "${preferredTime}", taking earliest`, "yellow");
            targetSlot = allSlots[0];
        }
    } else {
        targetSlot = allSlots[0];
    }

    log(`  → Clicking time slot: "${targetSlot.text}"`, "dim");
    const clicked = await clickSafely(page, targetSlot.el, `time slot "${targetSlot.text}"`);

    if (clicked) {
        log(`  ✅ Time slot selected: ${targetSlot.text}`, "green");
        await wait(1000);
        return targetSlot.text;
    }

    log("  ⚠️  Time slot click failed", "yellow");
    return null;
}

// ========================== SUBMIT RESCHEDULE ==========================

async function submitModification(page) {
    log("  🔍 Looking for submit/Book Showing button...", "dim");
    await wait(1000);

    const submitHandle = await page.evaluateHandle(() => {
        const labels = [
            "book showing", "modify showing", "confirm", "save", "submit", "update showing",
        ];
        const candidates = Array.from(
            document.querySelectorAll('button, a[role="button"], [role="button"], input[type="submit"]')
        );
        for (const el of candidates) {
            if (el.offsetParent === null) continue;
            if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;
            if (el.classList.contains("disabled")) continue;
            const t = (el.textContent || el.value || "").trim().toLowerCase();
            if (labels.some((l) => t.includes(l))) return el;
        }
        return null;
    });

    const submitBtn = submitHandle.asElement ? submitHandle.asElement() : null;

    if (!submitBtn) {
        log("  ❌ Submit button not found", "red");
        await takeScreenshot(page, "reschedule_err_no_submit");
        return false;
    }

    const btnText = await page.evaluate((el) => (el.textContent || "").trim(), submitBtn);
    log(`  → Clicking "${btnText}" button`, "dim");

    await clickSafely(page, submitBtn, `"${btnText}" button`);
    await wait(CONFIG.mediumWait);

    return true;
}

// ========================== VERIFY SUCCESS ==========================

async function verifyRescheduleSuccess(page) {
    log("  🔍 Verifying reschedule success...", "dim");

    for (let i = 0; i < 8; i++) {
        const result = await page.evaluate(() => {
            const body = (document.body.innerText || "").toLowerCase();
            const url = window.location.href;

            if (
                body.includes("showing updated") ||
                body.includes("showing modified") ||
                body.includes("successfully rescheduled") ||
                body.includes("booking confirmed") ||
                body.includes("showing confirmed") ||
                body.includes("reschedule confirmed")
            ) return "text_success";

            const allEls = Array.from(document.querySelectorAll("*"));
            for (const el of allEls) {
                if (el.children.length > 2) continue;
                const t = (el.textContent || "").trim().toLowerCase();
                if (t === "confirmed" && el.offsetParent !== null) return "badge_confirmed";
            }

            if (url.includes("/my_business/showing/") && !url.includes("/time_change")) {
                return "url_detail";
            }
            if (url.includes("/calendar") || url.includes("/showings")) {
                return "url_list";
            }
            return null;
        });

        if (result) {
            log(`  ✅ Reschedule confirmed (signal: ${result})`, "green");
            return true;
        }
        await wait(CONFIG.shortWait);
    }

    log("  ⚠️  Could not confirm reschedule success — may still have worked", "yellow");
    return false;
}

// ========================== FULL RESCHEDULE FLOW ==========================

/**
 * Performs the complete reschedule for a single showing.
 */
async function performReschedule(page, showing, newDate, newTime, newDuration) {
    log(`\n  📅 Rescheduling: "${showing.address}" [${showing.tag}]`, "magenta");
    await wait(CONFIG.mediumWait);

    const onDetailPage = await page.evaluate(() => {
        const url = window.location.href;
        const body = document.body.innerText || "";
        return (
            url.includes("/showing/") ||
            (body.toLowerCase().includes("reschedule") && body.toLowerCase().includes("cancel"))
        );
    });

    if (!onDetailPage) {
        log(`  ❌ Not on a showing detail page (URL: ${page.url()})`, "red");
        await takeScreenshot(page, "reschedule_err_wrong_page");
        return false;
    }

    await takeScreenshot(page, "reschedule_01_detail");

    // --- Read original booking info ---
    const originalInfo = await extractOriginalBookingInfo(page);
    log(`  ℹ️  Original booking:`, "dim");
    log(`     Date    : ${originalInfo.dateText || "N/A"}`, "dim");
    log(`     Time    : ${originalInfo.timeText || "N/A"}`, "dim");
    log(`     Duration: ${originalInfo.durationText || "N/A"}`, "dim");

    // --- Validate new date ---
    const validation = validateRescheduleDate(newDate, originalInfo.dateIso);
    if (!validation.valid) {
        log(`  ❌ Date validation failed: ${validation.reason}`, "red");
        return false;
    }

    if (newDate) {
        log(`  ✓ Date validation passed: ${newDate} >= original date`, "dim");
    }

    // --- Click Reschedule button ---
    const rescheduled = await clickRescheduleButton(page);
    if (!rescheduled) return false;

    await takeScreenshot(page, "reschedule_02_modify_page");

    // --- Step 2: Select date ---
    await selectDateOnModifyPage(page, newDate);
    await takeScreenshot(page, "reschedule_03_date_selected");

    // --- Select duration (before time so time slots may update) ---
    const selectedDuration = await selectDuration(page, newDuration);
    await wait(800);

    // --- Step 3: Select time slot ---
    const selectedTime = await selectTimeSlot(page, newTime);
    await takeScreenshot(page, "reschedule_04_time_selected");

    if (!selectedTime) {
        log("  ⚠️  No time slot was selected — aborting this reschedule", "yellow");
        return false;
    }

    // --- Submit ---
    const submitted = await submitModification(page);
    if (!submitted) return false;

    await takeScreenshot(page, "reschedule_05_submitted");

    // --- Verify ---
    const success = await verifyRescheduleSuccess(page);
    await takeScreenshot(page, "reschedule_06_done");

    if (success) {
        log(`  ✅ Rescheduled to: ${newDate || "original date"} @ ${selectedTime}${selectedDuration ? ` (${selectedDuration} min)` : ""}`, "green");
    }

    return success;
}

// ========================== EXPORTED API ==========================

/**
 * Run a reschedule sweep using a pre-existing browser instance.
 *
 * @param {import('puppeteer').Browser} browser
 * @param {Object} options
 * @param {boolean}  [options.dryRun=false]
 * @param {string|null} [options.addressFilter=null]   - lowercase partial address
 * @param {string|null} [options.newDate=null]         - "YYYY-MM-DD"
 * @param {string|null} [options.newTime=null]         - "HH:MM AM/PM"
 * @param {number|null} [options.newDuration=null]     - minutes
 * @returns {Promise<{rescheduled: number, failed: number, scanned: number, errors: string[]}>}
 */
export async function runRescheduleSweep(browser, options = {}) {
    const {
        dryRun = false,
        addressFilter = null,
        newDate = null,
        newTime = null,
        newDuration = null,
    } = options;

    let page = null;
    const stats = { scanned: 0, rescheduled: 0, failed: 0, skipped: 0, errors: [] };

    try {
        log(`\n${"═".repeat(70)}`, "bright");
        log("  📅  [RESCHEDULE] Reschedule Sweep Starting", "bright");
        log(`${"═".repeat(70)}`, "bright");
        if (dryRun) log("  ⚡ DRY RUN — no actual changes", "yellow");
        if (addressFilter) log(`  🎯 Address filter: "${addressFilter}"`, "cyan");
        if (newDate) log(`  📆 New date    : ${newDate}`, "cyan");
        if (newTime) log(`  ⏰ New time    : ${newTime}`, "cyan");
        if (newDuration) log(`  ⏱️  New duration: ${newDuration} min`, "cyan");

        // --- Acquire page ---
        const useExistingTab = browser.isConnectedToExisting || browser._sessionReady;
        if (useExistingTab) {
            const pages = await browser.pages();
            const bbPage = pages.find(
                (p) =>
                    p.url().includes("edge.brokerbay.com") &&
                    !p.url().includes("auth.brokerbay.com")
            );
            page = bbPage || (await browser.newPage());
            try { await page.bringToFront(); } catch { }
        } else {
            const pages = await browser.pages();
            page = pages.length > 0 ? pages[0] : await browser.newPage();
            if (!page.url().includes("brokerbay.com")) {
                await page.goto("https://edge.brokerbay.com/#/my_business", {
                    waitUntil: "domcontentloaded",
                    timeout: CONFIG.navigationTimeout,
                });
                await wait(3000);
            }
            const sessionOk = await isSessionValid(page);
            if (!sessionOk) {
                log("  ❌ [RESCHEDULE] Session expired — re-export and re-deploy.", "red");
                stats.errors.push("Session expired");
                return stats;
            }
        }

        await page.setViewport(CONFIG.viewport);
        await navigateToShowings(page);

        const targeted = await scanAllPages(page, addressFilter);
        stats.scanned = targeted.length;

        log(`\n  📋 Found ${targeted.length} Confirmed showing(s)`, targeted.length > 0 ? "cyan" : "dim");
        targeted.forEach((s, i) =>
            log(
                `     ${i + 1}. [${s.tag.toUpperCase()}] ${s.address} — ${s.dateText || "N/A"}${s.detailUrl ? "" : " (no direct URL)"}`,
                "white"
            )
        );

        if (targeted.length === 0) {
            log("  ✅ No Confirmed showings found.", "green");
            return stats;
        }

        if (dryRun) {
            stats.skipped = targeted.length;
            log("\n  ⚡ Dry-run complete — no reschedules performed.", "yellow");
            return stats;
        }

        for (const showing of targeted) {
            log(`\n${"─".repeat(60)}`, "dim");
            log(`  🎯 [${showing.tag.toUpperCase()}] ${showing.address}`, "cyan");
            log(`     Current date: ${showing.dateText || "N/A"}  |  Page: ${showing.pageNum}`, "dim");

            const detailUrl = await navigateToShowingDetail(page, showing);
            if (!detailUrl || !detailUrl.includes("/showing/")) {
                log(`  ❌ Failed to reach detail page for: ${showing.address}`, "red");
                stats.failed++;
                stats.errors.push(`Detail nav failed: ${showing.address}`);
                await navigateToShowings(page);
                continue;
            }

            const success = await performReschedule(page, showing, newDate, newTime, newDuration);

            if (success) {
                stats.rescheduled++;
                log(`  ✅ Rescheduled (${stats.rescheduled} total)`, "green");
            } else {
                stats.failed++;
                stats.errors.push(`Reschedule failed: ${showing.address}`);
            }

            await wait(CONFIG.mediumWait);
            await navigateToShowings(page);
        }

        log(`\n${"═".repeat(70)}`, "bright");
        log("  📊  [RESCHEDULE] SWEEP SUMMARY", "bright");
        log(`${"═".repeat(70)}`, "bright");
        log(`  Scanned     : ${stats.scanned}`, "white");
        log(`  Rescheduled : ${stats.rescheduled}`, "green");
        log(`  Failed      : ${stats.failed}`, stats.failed > 0 ? "red" : "white");
        if (stats.errors.length > 0) {
            stats.errors.forEach((e, i) => log(`    ${i + 1}. ${e}`, "red"));
        }
        log(`${"═".repeat(70)}\n`, "bright");

    } catch (err) {
        log(`  ❌ [RESCHEDULE] Sweep error: ${err.message}`, "red");
        log(err.stack, "dim");
        stats.errors.push(`Fatal: ${err.message}`);
        if (page) await takeScreenshot(page, "reschedule_sweep_fatal");
    }

    return stats;
}

// ========================== CLI ENTRY POINT ==========================

async function main() {
    log("\n" + "═".repeat(70), "bright");
    log("  📅  AUTO-RESCHEDULE SHOWINGS", "bright");
    log("═".repeat(70), "bright");

    if (DRY_RUN) log("  ⚡ DRY RUN MODE — no changes will be made\n", "yellow");
    if (TARGET_ADDRESS) log(`  🎯 Address filter : "${TARGET_ADDRESS}"\n`, "cyan");

    log(`  Targets       : Confirmed only`, "dim");
    if (NEW_DATE)     log(`  New date      : ${NEW_DATE}`, "dim");
    if (NEW_TIME)     log(`  New time      : ${NEW_TIME}`, "dim");
    if (NEW_DURATION) log(`  New duration  : ${NEW_DURATION} min`, "dim");
    if (!NEW_DATE && !NEW_TIME && !NEW_DURATION) {
        log("  ⚠️  No new date/time/duration specified — calendar will open but no changes will be selected.", "yellow");
        log("  Usage: node auto-reschedule-showings.js --date YYYY-MM-DD --time \"HH:MM AM\" --duration <min>", "dim");
    }
    log(`  Base URL      : ${CONFIG.showingsUrl}\n`, "dim");

    if (!DRY_RUN && !NEW_DATE && !NEW_TIME && !NEW_DURATION) {
        log("  ❌ Aborting: you must provide at least --date, --time, or --duration when not in --dry-run mode.", "red");
        process.exit(1);
    }

    let browser = null;

    try {
        browser = await launchWithSession({
            headless: process.env.HEADLESS !== "false",
            defaultViewport: CONFIG.viewport,
        });

        await runRescheduleSweep(browser, {
            dryRun: DRY_RUN,
            addressFilter: TARGET_ADDRESS,
            newDate: NEW_DATE,
            newTime: NEW_TIME,
            newDuration: NEW_DURATION,
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
