import { loadConfig } from "./config.js";
import { deliverAndAdvance } from "./delivery.js";
import { buildInventory } from "./listings.js";
import {
  emailConfigured,
  sendEmail,
  sendFailureAlert,
  sendRecoveryAlert,
  verifyEmail,
} from "./notify.js";
import { writeReports } from "./report.js";
import { retryDelayMinutes } from "./scheduler.js";
import { detectChanges, readState, writeState } from "./state.js";
import { scrapeInventory } from "./sources.js";
import { inventoryPageUrl } from "./tesla-api.js";

const flags = new Set(process.argv.slice(2));
const dryRun = flags.has("--dry-run");
const watch = flags.has("--watch");
const maxRunsArgument = process.argv.find((argument) => argument.startsWith("--max-runs="));
const maxRuns = maxRunsArgument ? Number.parseInt(maxRunsArgument.split("=")[1], 10) : null;
const config = loadConfig();
let stopRequested = false;
let pendingSleep = null;

if (maxRuns !== null && (!Number.isInteger(maxRuns) || maxRuns < 1)) {
  throw new Error("--max-runs must be a positive integer.");
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingSleep = null;
      resolve();
    }, milliseconds);
    pendingSleep = { timer, resolve };
  });
}

function requestStop(signal) {
  console.log(`\n${signal} reçu : arrêt propre demandé…`);
  stopRequested = true;
  if (pendingSleep) {
    clearTimeout(pendingSleep.timer);
    pendingSleep.resolve();
    pendingSleep = null;
  }
}

process.once("SIGINT", () => requestStop("SIGINT"));
process.once("SIGTERM", () => requestStop("SIGTERM"));

async function run() {
  const startedAt = new Date();
  console.log(`[${startedAt.toISOString()}] Vérification de l'inventaire Tesla…`);

  const scrapedResult = await scrapeInventory(config);
  const scraped = scrapedResult.listings;
  const result = {
    ...buildInventory(scraped, config),
    scrapedCount: scraped.length,
    source: scrapedResult.source,
    inventoryPageUrl: inventoryPageUrl(config),
  };
  const state = await readState(config.paths.state);
  const firstSuccessfulRun = state.version !== 2;
  const changes =
    firstSuccessfulRun && !config.notifyOnFirstRun
      ? []
      : detectChanges(result.eligible, firstSuccessfulRun ? { seen: {} } : state);
  const markdown = await writeReports(result, config, startedAt);

  console.log(markdown);
  console.log(`${changes.length} nouvelle(s) annonce(s) ou baisse(s) de prix détectée(s).`);

  if (dryRun) {
    console.log("Mode simulation : aucun email envoyé et état inchangé.");
    return { changes: changes.length, firstSuccessfulRun };
  }

  const delivery = await deliverAndAdvance({
    changes,
    sendChanges: () => sendEmail(result, changes, config, startedAt),
    advanceState: () => writeState(config.paths.state, result.eligible, startedAt, state),
  });
  if (changes.length) {
    console.log(
      delivery.notification.sent
        ? `Email envoyé (${delivery.notification.messageId}).`
        : delivery.notification.reason,
    );
  } else {
    console.log(
      firstSuccessfulRun && !config.notifyOnFirstRun
        ? "Inventaire initial mémorisé sans notification. Les prochaines nouveautés seront signalées."
        : "Aucun changement : pas d'email.",
    );
  }

  if (!delivery.advanced) {
    console.warn("État inchangé : la notification sera retentée lors du prochain passage.");
  }

  return { changes: changes.length, firstSuccessfulRun };
}

async function runOnce() {
  try {
    await run();
    return { succeeded: true, error: null };
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Échec :`, error);
    return { succeeded: false, error };
  }
}

async function runContinuously() {
  if (!dryRun && !emailConfigured(config.smtp)) {
    throw new Error(
      "Le mode continu exige une configuration SMTP complète dans .env (SMTP_HOST, EMAIL_FROM et EMAIL_TO).",
    );
  }
  if (!dryRun) {
    await verifyEmail(config.smtp);
    console.log(`Connexion email vérifiée pour ${config.smtp.to}.`);
  }

  let completedRuns = 0;
  let consecutiveFailures = 0;

  while (!stopRequested) {
    const previousFailures = consecutiveFailures;
    const attempt = await runOnce();
    completedRuns += 1;
    consecutiveFailures = attempt.succeeded ? 0 : consecutiveFailures + 1;

    if (!dryRun && !attempt.succeeded && consecutiveFailures === config.failureAlertThreshold) {
      try {
        await sendFailureAlert(config, attempt.error, consecutiveFailures);
        console.log("Alerte de panne envoyée par email.");
      } catch (emailError) {
        console.error("Impossible d'envoyer l'alerte de panne :", emailError.message);
      }
    }
    if (!dryRun && attempt.succeeded && previousFailures >= config.failureAlertThreshold) {
      try {
        await sendRecoveryAlert(config);
        console.log("Alerte de rétablissement envoyée par email.");
      } catch (emailError) {
        console.error("Impossible d'envoyer l'alerte de rétablissement :", emailError.message);
      }
    }

    if (stopRequested || (maxRuns !== null && completedRuns >= maxRuns)) break;

    const delayMinutes = retryDelayMinutes(config, consecutiveFailures);
    console.log(
      attempt.succeeded
        ? `Prochaine vérification dans ${delayMinutes} minute(s).`
        : `Nouvel essai dans ${delayMinutes} minute(s) après ${consecutiveFailures} échec(s).`,
    );
    await wait(delayMinutes * 60_000);
  }

  console.log("Moniteur arrêté proprement.");
}

if (watch) {
  try {
    await runContinuously();
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Configuration invalide :`, error.message);
    process.exitCode = 1;
  }
} else if (!(await runOnce()).succeeded) {
  process.exitCode = 1;
}
