import nodemailer from "nodemailer";
import { htmlReport } from "./report.js";

export function emailConfigured(smtp) {
  return Boolean(
    smtp.host && smtp.from && smtp.to && (!smtp.user || smtp.password),
  );
}

function createTransport(smtp) {
  const auth = smtp.user ? { user: smtp.user, pass: smtp.password } : undefined;
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth,
  });
}

export async function verifyEmail(smtp) {
  if (!emailConfigured(smtp)) {
    throw new Error("Configuration email incomplète.");
  }
  await createTransport(smtp).verify();
}

export async function sendTestEmail(smtp) {
  const info = await createTransport(smtp).sendMail({
    from: smtp.from,
    to: smtp.to,
    subject: "Tesla Model Y monitor — configuration réussie",
    text:
      "La configuration email fonctionne. Le moniteur vous préviendra lorsqu'une Tesla Model Y neuve apparaîtra dans l'inventaire surveillé.",
  });
  return info.messageId;
}

export async function sendFailureAlert(config, error, failures) {
  return createTransport(config.smtp).sendMail({
    from: config.smtp.from,
    to: config.smtp.to,
    subject: "Tesla Model Y monitor — surveillance en échec",
    text: `Les ${failures} dernières vérifications ont échoué. Le moniteur continue ses tentatives automatiquement.\n\nDernière erreur : ${error.message}`,
  });
}

export async function sendRecoveryAlert(config) {
  return createTransport(config.smtp).sendMail({
    from: config.smtp.from,
    to: config.smtp.to,
    subject: "Tesla Model Y monitor — surveillance rétablie",
    text: "La connexion à l'inventaire Tesla fonctionne de nouveau. La surveillance continue normalement.",
  });
}

export async function sendEmail(result, changes, config, generatedAt) {
  if (!emailConfigured(config.smtp)) {
    return { sent: false, reason: "Email non configuré" };
  }

  const transport = createTransport(config.smtp);
  const priceDrops = changes.filter((change) => change.type === "price-drop").length;
  const newListings = changes.filter((change) => change.type === "new").length;
  const subject = `Tesla Model Y neuve : ${newListings} nouvelle(s), ${priceDrops} baisse(s) de prix`;
  const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
  const integer = new Intl.NumberFormat("fr-FR");
  const escapeHtml = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const changeItems = changes
    .map(({ type, listing, previousPriceEur }) => {
      const changeLabel =
        type === "price-drop"
          ? `Baisse de prix : ${euro.format(previousPriceEur)} → ${euro.format(listing.priceEur)}`
          : "Nouvelle annonce";
      const mileage =
        listing.odometerKm === null || listing.odometerKm === undefined
          ? "kilométrage non indiqué"
          : `${integer.format(listing.odometerKm)} km`;
      const price =
        listing.priceEur === null || listing.priceEur === undefined
          ? "prix non indiqué"
          : euro.format(listing.priceEur);
      return `<li style="margin:0 0 14px">
  <strong>${escapeHtml(changeLabel)}</strong><br>
  <a href="${escapeHtml(listing.url)}">${escapeHtml(listing.trim)}</a><br>
  ${escapeHtml(price)} · ${escapeHtml(mileage)} · ${escapeHtml(listing.city || listing.location)} · VIN ${escapeHtml(listing.vin)}
</li>`;
    })
    .join("");
  const changesHtml = `<div style="font:15px/1.5 Arial,sans-serif;color:#171a20;max-width:680px">
  <h1 style="font-size:22px">Changement détecté</h1>
  <ul>${changeItems}</ul>
</div>`;

  const info = await transport.sendMail({
    from: config.smtp.from,
    to: config.smtp.to,
    subject,
    html: `${changesHtml}${htmlReport(result, config, generatedAt)}`,
  });
  return { sent: true, messageId: info.messageId };
}
