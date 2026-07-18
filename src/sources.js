import { scrapeTeslaApiInventory } from "./tesla-api.js";
import { scrapeTeslaPageInventory } from "./tesla.js";

const defaultSources = [
  { name: "Tesla France page", scrape: scrapeTeslaPageInventory },
  { name: "Tesla France API", scrape: scrapeTeslaApiInventory },
];

export async function scrapeInventory(config, sources = defaultSources) {
  const errors = [];
  for (const source of sources) {
    try {
      const listings = await source.scrape(config);
      return { listings, source: source.name, previousErrors: errors };
    } catch (error) {
      errors.push(`${source.name}: ${error.message}`);
      console.warn(`${source.name} indisponible (${error.message}).`);
    }
  }

  throw new AggregateError(errors, `All Tesla inventory routes failed: ${errors.join(" | ")}`);
}
