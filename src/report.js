import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const integer = new Intl.NumberFormat("fr-FR");

function valueOrUnknown(value, formatter = String) {
  return value === null || value === undefined ? "non indiqué" : formatter(value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function markdownReport(result, config, generatedAt = new Date()) {
  const rows = result.shortlist.map(
    (listing, index) =>
      `| ${index + 1} | [${listing.trim}](${listing.url}) | ${valueOrUnknown(listing.priceEur, (value) => euro.format(value))} | ${valueOrUnknown(listing.odometerKm, (value) => `${integer.format(value)} km`)} | ${listing.location || "France"} | \`${listing.vin}\` |`,
  );

  return `# Tesla Model Y neuves disponibles — ${generatedAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}

Recherche officielle Tesla France : **Model Y neuve**, code postal **${config.postalCode}**, paramètre de rayon **${config.searchRange}**.

${result.shortlist.length ? `| # | Version | Prix | Kilométrage | Lieu | VIN |
|---:|---|---:|---:|---|---|
${rows.join("\n")}` : "Aucune Tesla Model Y neuve n'est disponible sur cette page pour le moment."}

${result.eligible.length} véhicule(s) actuellement visible(s). Source utilisée : ${result.source || "Tesla France"}.

Page surveillée : ${result.inventoryPageUrl}
`;
}

export function htmlReport(result, config, generatedAt = new Date()) {
  const cars = result.shortlist
    .map(
      (listing) => `<li style="margin:0 0 18px">
  <a href="${escapeHtml(listing.url)}"><strong>${escapeHtml(listing.trim)}</strong></a><br>
  ${escapeHtml(valueOrUnknown(listing.priceEur, (value) => euro.format(value)))} · ${escapeHtml(valueOrUnknown(listing.odometerKm, (value) => `${integer.format(value)} km`))}<br>
  ${escapeHtml(listing.location || "France")} · VIN ${escapeHtml(listing.vin)}
</li>`,
    )
    .join("");

  return `<div style="font:15px/1.5 Arial,sans-serif;color:#171a20;max-width:680px">
  <h1 style="font-size:22px">Tesla Model Y neuves disponibles</h1>
  <p>Page Tesla France surveillée pour le code postal <strong>${escapeHtml(config.postalCode)}</strong>.</p>
  ${cars ? `<ol>${cars}</ol>` : "<p>Aucune voiture visible actuellement.</p>"}
  <p><a href="${escapeHtml(result.inventoryPageUrl)}">Ouvrir l’inventaire Tesla surveillé</a></p>
  <p><small>${result.eligible.length} véhicule(s), vérifiés le ${escapeHtml(generatedAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris" }))}. La disponibilité peut changer à tout moment.</small></p>
</div>`;
}

export async function writeReports(result, config, generatedAt = new Date()) {
  const markdown = markdownReport(result, config, generatedAt);
  const payload = JSON.stringify(
    {
      generatedAt: generatedAt.toISOString(),
      search: {
        model: "Model Y",
        condition: "new",
        postalCode: config.postalCode,
        range: config.searchRange,
        inventoryPageUrl: result.inventoryPageUrl,
      },
      source: result.source,
      currentCount: result.eligible.length,
      currentInventory: result.eligible,
    },
    null,
    2,
  );

  await Promise.all(
    [config.paths.latestJson, config.paths.latestMarkdown].map((url) =>
      mkdir(fileURLToPath(new URL("./", url)), { recursive: true }),
    ),
  );
  await Promise.all([
    writeFile(config.paths.latestJson, `${payload}\n`, "utf8"),
    writeFile(config.paths.latestMarkdown, markdown, "utf8"),
  ]);
  return markdown;
}
