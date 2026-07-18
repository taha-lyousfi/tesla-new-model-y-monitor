import "dotenv/config";

function integer(name, fallback, minimum = 0) {
  const raw = process.env[name];
  const value = raw === undefined || raw === "" ? fallback : Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
  return value;
}

function number(name, fallback) {
  const raw = process.env[name];
  const value = raw === undefined || raw === "" ? fallback : Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number.`);
  }
  return value;
}

function boolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (["1", "true", "yes", "on"].includes(raw.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(raw.toLowerCase())) return false;
  throw new Error(`${name} must be true or false.`);
}

export function loadConfig() {
  return {
    postalCode: process.env.POSTAL_CODE || "92360",
    latitude: number("SEARCH_LAT", 48.8127),
    longitude: number("SEARCH_LNG", 2.2382),
    searchRange: integer("SEARCH_RANGE", 0, 0),
    topN: integer("TOP_N", 20, 1),
    checkIntervalMinutes: integer("CHECK_INTERVAL_MINUTES", 5, 5),
    retryDelayMinutes: integer("RETRY_DELAY_MINUTES", 2, 1),
    maxRetryDelayMinutes: integer("MAX_RETRY_DELAY_MINUTES", 30, 1),
    failureAlertThreshold: integer("FAILURE_ALERT_THRESHOLD", 3, 1),
    notifyOnFirstRun: boolean("NOTIFY_ON_FIRST_RUN", true),
    headless: boolean("HEADLESS", true),
    browserChannel: process.env.BROWSER_CHANNEL || "chrome",
    teslaApiBaseUrl:
      process.env.TESLA_API_BASE_URL ||
      "https://www.tesla.com/inventory/api/v4/inventory-results",
    proxy: {
      server: process.env.TESLA_PROXY_SERVER || "",
      username: process.env.TESLA_PROXY_USERNAME || "",
      password: process.env.TESLA_PROXY_PASSWORD || "",
    },
    paths: {
      state: new URL("../data/state.json", import.meta.url),
      latestJson: new URL("../output/latest.json", import.meta.url),
      latestMarkdown: new URL("../output/latest.md", import.meta.url),
    },
    smtp: {
      host: process.env.SMTP_HOST || "",
      port: integer("SMTP_PORT", 587, 1),
      secure: boolean("SMTP_SECURE", false),
      user: process.env.SMTP_USER || "",
      password: process.env.SMTP_PASSWORD || "",
      from: process.env.EMAIL_FROM || "",
      to: process.env.EMAIL_TO || "",
    },
  };
}
