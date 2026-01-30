#!/usr/bin/env node

import { configDotenv } from "dotenv";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { loginToBrokerBay } from "./src/utils.js";
import fs from "fs/promises";

configDotenv();
puppeteer.use(StealthPlugin());

const args = process.argv.slice(2);
const property = args[0];

if (!property || property.trim().length < 3) {
  console.error("❌ Provide a property/address to check");
  process.exit(1);
}

const CONFIG = {
  headless: true,
  slowMo: parseInt(process.env.SLOW_MO || "80"),
  timeout: 90000,
  navigationTimeout: 120000,
  pageLoadWait: 4000,
  viewport: { width: 1600, height: 900 },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getExecutablePath() {
  const path = process.env.BROWSER_EXECUTABLE_PATH;
  if (!path) return undefined;
  try {
    await fs.access(path);
    return path;
  } catch {
    return undefined;
  }
}

function normalizePropertyAddress(raw) {
  if (!raw) return "";
  const firstComma = raw.indexOf(",");
  const truncated = firstComma >= 0 ? raw.slice(0, firstComma) : raw;
  return truncated.trim().toLowerCase();
}

async function searchAndDetect(page, searchQuery) {
  const searchSelectors = [
    'input[placeholder*="Search listings"]',
    'input[placeholder*="Search"]',
    'input[type="search"]',
    '.search-input input',
  ];

  const root = normalizePropertyAddress(searchQuery);

  for (const sel of searchSelectors) {
    const box = await page.$(sel);
    if (box) {
      await box.click({ clickCount: 3 });
      await box.type(searchQuery, { delay: 80 });
      await page.keyboard.press("Enter");
      break;
    }
  }

  await sleep(1500);

  const found = await page.evaluate((root) => {
    const rows = Array.from(document.querySelectorAll("table tbody tr"));
    if (!rows.length) return false;
    return rows.some((row) => {
      const txt = (row.textContent || "").toLowerCase();
      return txt.includes(root);
    });
  }, root);

  return found;
}

async function main() {
  let browser = null;
  try {
    console.log("🔍 Checking property existence:", property);

    const executablePath = await getExecutablePath();
    const launchOptions = {
      headless: CONFIG.headless,
      slowMo: CONFIG.slowMo,
      userDataDir: process.env.BROWSER_PROFILE_USERDATA,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      protocolTimeout: CONFIG.navigationTimeout,
    };
    if (executablePath) {
      launchOptions.executablePath = executablePath;
    }
    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    await page.setViewport(CONFIG.viewport);
    await page.setDefaultTimeout(CONFIG.timeout);
    await page.setDefaultNavigationTimeout(CONFIG.navigationTimeout);

    const loginOk = await loginToBrokerBay(page);
    if (!loginOk) {
      console.error("❌ Login failed");
      process.exit(1);
    }

    await page.goto("https://edge.brokerbay.com/#/listing/list/brokerage", {
      waitUntil: "networkidle2",
      timeout: CONFIG.navigationTimeout,
    });
  await sleep(CONFIG.pageLoadWait);

    const exists = await searchAndDetect(page, property);

    console.log(`RESULT: ${JSON.stringify({ exists })}`);
    process.exit(0);
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();


