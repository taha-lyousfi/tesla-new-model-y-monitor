import { chromium } from "playwright";
import {
  inventoryPageUrl,
  isExpectedInventoryRequest,
  parseTeslaApiPayload,
} from "./tesla-api.js";

function digits(value) {
  const normalized = String(value || "").replace(/[^0-9]/g, "");
  return normalized ? Number.parseInt(normalized, 10) : null;
}

function parseBrowserCard(raw) {
  if (!raw.vin) return null;
  const priceMatch = raw.details.match(/([\d\s\u00a0\u202f]+)\s*€/u);
  const odometerMatch = raw.details.match(/([\d\s\u00a0\u202f]+)\s*km/iu);
  const yearMatch = raw.details.match(/\b(20\d{2})\b/u);
  return {
    vin: raw.vin,
    model: "Model Y",
    trim: raw.trim || "Model Y",
    priceEur: priceMatch ? digits(priceMatch[1]) : null,
    year: yearMatch ? digits(yearMatch[1]) : null,
    odometerKm: odometerMatch ? digits(odometerMatch[1]) : null,
    location: raw.location || "France",
    city: raw.location || "France",
    availableNow: true,
    whiteInterior: /INPW|IN3W|white|blanc|noir et blanc/iu.test(
      `${raw.optionCodes} ${raw.features.join(" ")}`,
    ),
    features: raw.features,
    url: `https://www.tesla.com/fr_FR/my/order/${encodeURIComponent(raw.vin)}?titleStatus=new`,
    source: "Tesla France page",
  };
}

function proxyOptions(proxy) {
  if (!proxy.server) return undefined;
  return {
    server: proxy.server,
    username: proxy.username || undefined,
    password: proxy.password || undefined,
  };
}

export async function scrapeTeslaPageInventory(config) {
  const browser = await chromium.launch({
    channel: config.browserChannel || undefined,
    headless: config.headless,
    proxy: proxyOptions(config.proxy),
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const context = await browser.newContext({
      locale: "fr-FR",
      timezoneId: "Europe/Paris",
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    const inventoryResponses = [];

    page.on("response", (response) => {
      if (
        response.url().includes("/inventory/api/") &&
        response.url().includes("inventory-results") &&
        isExpectedInventoryRequest(response.url(), config)
      ) {
        inventoryResponses.push(response);
      }
    });

    await page.goto(inventoryPageUrl(config), {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    if ((await page.title()).toLowerCase().includes("access denied")) {
      throw new Error("Tesla refused the Chrome session with an Access Denied page.");
    }

    await page.waitForTimeout(8_000);

    for (const response of inventoryResponses.reverse()) {
      if (!response.ok()) continue;
      const contentType = response.headers()["content-type"] || "";
      if (!contentType.includes("json")) continue;
      try {
        return parseTeslaApiPayload(await response.json());
      } catch {
        // Continue to the rendered-card route when Tesla changes an API payload.
      }
    }

    const rawCards = await page.locator(
      "article.result.card[data-id]:not(.vehicle-card--search)",
    ).evaluateAll((cards) =>
      cards.map((card) => {
        const id = card.getAttribute("data-id") || "";
        const chip = card.querySelector(".inventory-card-chip [title], .inventory-card-chip");
        const image = card.querySelector("img.result-image.full");
        return {
          vin: id.split("-")[0],
          trim: card.querySelector(".trim-name")?.textContent?.trim() || "",
          details: card.querySelector(".card-info-details")?.textContent?.trim() || "",
          location:
            chip?.getAttribute("title")?.trim() ||
            chip?.textContent?.trim() ||
            "France",
          features: Array.from(
            card.querySelectorAll(
              ".feature-list-tooltip .feature-list-item .option-description",
            ),
          )
            .map((item) => item.textContent?.trim() || "")
            .filter(Boolean),
          optionCodes: image?.getAttribute("src") || "",
        };
      }),
    );
    const listings = rawCards.map(parseBrowserCard).filter(Boolean);
    if (listings.length) return listings;

    const hasInventoryShell = await page
      .getByText("Véhicules disponibles", { exact: true })
      .isVisible()
      .catch(() => false);
    if (hasInventoryShell) return [];

    throw new Error("Tesla loaded without inventory data or the recognized empty-inventory page.");
  } finally {
    await browser.close();
  }
}
