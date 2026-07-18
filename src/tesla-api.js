import { ProxyAgent } from "undici";

const ORDER_BASE_URL = "https://www.tesla.com/fr_FR/my/order/";

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(/[^0-9.,-]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(...values) {
  for (const value of values) {
    const candidate = first(value);
    if (candidate !== null && candidate !== undefined && String(candidate).trim()) {
      return String(candidate).trim();
    }
  }
  return null;
}

export function buildInventoryQuery(config) {
  return {
    query: {
      model: "my",
      condition: "new",
      options: {},
      arrangeby: "Price",
      order: "asc",
      market: "FR",
      language: "fr",
      super_region: "europe",
      PaymentType: "cash",
      paymentRange: "0,100000",
      lng: config.longitude,
      lat: config.latitude,
      zip: config.postalCode,
      range: config.searchRange,
    },
    offset: 0,
    count: 50,
    outsideOffset: 0,
    outsideSearch: false,
  };
}

export function inventoryPageUrl(config) {
  const url = new URL("https://www.tesla.com/fr_FR/inventory/new/my");
  url.searchParams.set("arrangeby", "plh");
  url.searchParams.set("zip", config.postalCode);
  url.searchParams.set("range", String(config.searchRange));
  return url.toString();
}

export function isExpectedInventoryRequest(url, config) {
  try {
    const encodedQuery = new URL(url).searchParams.get("query");
    if (!encodedQuery) return false;
    const parsed = JSON.parse(encodedQuery).query;
    return (
      parsed?.model === "my" &&
      parsed?.condition === "new" &&
      String(parsed?.zip) === String(config.postalCode) &&
      Number(parsed?.range) === Number(config.searchRange)
    );
  } catch {
    return false;
  }
}

export function parseTeslaApiListing(raw) {
  const vin = stringOrNull(raw.VIN, raw.vin, raw.VehicleIdentificationNumber);
  if (!vin) return null;

  const trim = stringOrNull(
    raw.TrimName,
    raw.Trim,
    raw.TRIM_DISPLAY,
    raw.Title,
    first(raw.TRIM),
    "Model Y",
  );
  const city = stringOrNull(
    raw.DeliveryCenterDisplayName,
    raw.MetroName,
    raw.City,
    raw.Location,
    raw.StateProvince,
    "France",
  );
  const priceEur = numberOrNull(
    raw.InventoryPrice ?? raw.PurchasePrice ?? raw.TotalPrice ?? raw.Price,
  );
  const odometerKm = numberOrNull(raw.Odometer ?? raw.OdometerKM ?? raw.Mileage);
  const modelYear = numberOrNull(raw.Year ?? raw.ModelYear);
  const optionCodes = stringOrNull(raw.OptionCodeList, raw.OptionCodes, "") || "";
  const interior = stringOrNull(raw.INTERIOR, raw.Interior, raw.InteriorColor, "") || "";

  return {
    vin,
    model: "Model Y",
    trim,
    priceEur,
    year: modelYear,
    odometerKm,
    location: city,
    city,
    availableNow: true,
    whiteInterior: /INPW|IN3W|white|blanc/iu.test(`${optionCodes} ${interior}`),
    features: [interior, optionCodes].filter(Boolean),
    url: `${ORDER_BASE_URL}${encodeURIComponent(vin)}?titleStatus=new`,
    source: "Tesla France API",
  };
}

export function parseTeslaApiPayload(payload) {
  if (!payload || !Array.isArray(payload.results)) {
    throw new Error("Tesla returned JSON without a results array.");
  }
  return payload.results.map(parseTeslaApiListing).filter(Boolean);
}

export async function scrapeTeslaApiInventory(config) {
  const query = encodeURIComponent(JSON.stringify(buildInventoryQuery(config)));
  let dispatcher;
  if (config.proxy?.server) {
    const proxyUrl = new URL(config.proxy.server);
    if (config.proxy.username) proxyUrl.username = config.proxy.username;
    if (config.proxy.password) proxyUrl.password = config.proxy.password;
    dispatcher = new ProxyAgent(proxyUrl.toString());
  }

  try {
    const response = await fetch(`${config.teslaApiBaseUrl}?query=${query}`, {
      headers: {
        accept: "application/json",
        "accept-language": "fr-FR,fr;q=0.9",
        "user-agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(20_000),
      dispatcher,
    });

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.includes("json")) {
      throw new Error(`Tesla inventory API returned HTTP ${response.status} (${contentType || "unknown content type"}).`);
    }

    return parseTeslaApiPayload(await response.json());
  } finally {
    await dispatcher?.close();
  }
}
