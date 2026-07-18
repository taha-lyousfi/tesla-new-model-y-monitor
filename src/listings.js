function price(listing) {
  return listing.priceEur ?? Number.MAX_SAFE_INTEGER;
}

export function buildInventory(listings, config) {
  const unique = [
    ...new Map(
      listings
        .filter((listing) => listing?.vin)
        .map((listing) => [listing.vin, listing]),
    ).values(),
  ].sort((left, right) => price(left) - price(right) || left.vin.localeCompare(right.vin));

  return {
    eligible: unique,
    shortlist: unique.slice(0, config.topN),
  };
}
