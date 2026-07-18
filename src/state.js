import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function readState(url) {
  try {
    return JSON.parse(await readFile(url, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { active: {}, seen: {} };
    throw error;
  }
}

export function detectChanges(listings, state) {
  return listings.flatMap((listing) => {
    const previous = state.seen?.[listing.vin] || state.listings?.[listing.vin];
    if (!previous) return [{ type: "new", listing }];
    if (
      listing.priceEur !== null &&
      previous.priceEur !== null &&
      listing.priceEur < previous.priceEur
    ) {
      return [{ type: "price-drop", listing, previousPriceEur: previous.priceEur }];
    }
    return [];
  });
}

export async function writeState(url, listings, checkedAt = new Date(), previousState = {}) {
  const seen = { ...(previousState.seen || previousState.listings || {}) };
  for (const listing of listings) {
    const previous = seen[listing.vin];
    seen[listing.vin] = {
      firstSeenAt: previous?.firstSeenAt || checkedAt.toISOString(),
      lastSeenAt: checkedAt.toISOString(),
      priceEur: listing.priceEur,
      url: listing.url,
    };
  }

  const state = {
    version: 2,
    checkedAt: checkedAt.toISOString(),
    active: Object.fromEntries(
      listings.map((listing) => [listing.vin, { priceEur: listing.priceEur, url: listing.url }]),
    ),
    seen,
  };
  await mkdir(fileURLToPath(new URL("./", url)), { recursive: true });
  await writeFile(url, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
