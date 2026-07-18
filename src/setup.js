import { access, chmod, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { sendTestEmail, verifyEmail } from "./notify.js";

const ENV_PATH = new URL("../.env", import.meta.url);

export function normalizeAppPassword(value) {
  return String(value || "").replace(/\s+/g, "");
}

export function validateGmailAddress(value) {
  return /^[^\s@]+@gmail\.com$/iu.test(value);
}

export function validateAppPassword(value) {
  return /^[a-z0-9]{16}$/iu.test(normalizeAppPassword(value));
}

export function buildEnvFile({ sender, recipient, appPassword, intervalMinutes }) {
  return `POSTAL_CODE=92360
SEARCH_LAT=48.8127
SEARCH_LNG=2.2382
SEARCH_RANGE=0
TOP_N=20

CHECK_INTERVAL_MINUTES=${intervalMinutes}
RETRY_DELAY_MINUTES=2
MAX_RETRY_DELAY_MINUTES=30
FAILURE_ALERT_THRESHOLD=3
NOTIFY_ON_FIRST_RUN=true
HEADLESS=true
BROWSER_CHANNEL=chrome

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=${sender}
SMTP_PASSWORD=${appPassword}
EMAIL_FROM=Tesla Model Y Monitor <${sender}>
EMAIL_TO=${recipient}

# Optional authenticated proxy for servers whose IP is blocked by Tesla.
TESLA_PROXY_SERVER=
TESLA_PROXY_USERNAME=
TESLA_PROXY_PASSWORD=
`;
}

async function fileExists(url) {
  try {
    await access(url);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function secretQuestion(prompt) {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error("Run npm run setup in an interactive terminal.");
  }

  return new Promise((resolve, reject) => {
    let value = "";
    stdout.write(prompt);
    stdin.setEncoding("utf8");
    stdin.setRawMode(true);
    stdin.resume();

    const finish = (error) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") return finish(new Error("Setup cancelled."));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f") {
          if (value) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
        } else if (character >= " " && character !== "\u001b") {
          value += character;
          stdout.write("*");
        }
      }
    };

    stdin.on("data", onData);
  });
}

async function main() {
  const questions = createInterface({ input: stdin, output: stdout });
  try {
    console.log("\nTesla Model Y new-inventory monitor setup\n");
    console.log("Before continuing:");
    console.log("1. Enable Google 2-Step Verification on the Gmail sender account.");
    console.log("2. Create an App Password at https://myaccount.google.com/apppasswords");
    console.log("3. Never use or share the normal Google password.\n");

    if (await fileExists(ENV_PATH)) {
      const answer = (await questions.question("A .env file already exists. Replace it? [y/N] ")).trim();
      if (!/^y(?:es)?$/iu.test(answer)) {
        console.log("Setup cancelled; the existing .env was not changed.");
        return;
      }
    }

    const sender = (await questions.question("Gmail address used to send alerts: ")).trim();
    if (!validateGmailAddress(sender)) throw new Error("Enter a valid @gmail.com address.");

    const recipientAnswer = (
      await questions.question(`Notification recipient [${sender}]: `)
    ).trim();
    const recipient = recipientAnswer || sender;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(recipient)) {
      throw new Error("Enter a valid recipient email address.");
    }

    const intervalAnswer = (
      await questions.question("Successful-check interval in minutes [5]: ")
    ).trim();
    const intervalMinutes = intervalAnswer ? Number.parseInt(intervalAnswer, 10) : 5;
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 5) {
      throw new Error("The interval must be an integer of at least 5 minutes.");
    }

    questions.close();
    const appPassword = normalizeAppPassword(
      await secretQuestion("16-character Google App Password (hidden): "),
    );
    if (!validateAppPassword(appPassword)) {
      throw new Error("A Google App Password must contain exactly 16 letters or digits.");
    }

    const smtp = {
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      user: sender,
      password: appPassword,
      from: `Tesla Model Y Monitor <${sender}>`,
      to: recipient,
    };
    console.log("Verifying Gmail authentication…");
    await verifyEmail(smtp);

    await writeFile(
      ENV_PATH,
      buildEnvFile({ sender, recipient, appPassword, intervalMinutes }),
      { encoding: "utf8", mode: 0o600 },
    );
    await chmod(ENV_PATH, 0o600);
    const messageId = await sendTestEmail(smtp);
    console.log(`Configuration saved securely and test email sent (${messageId}).`);
    console.log("Start continuous monitoring with: npm start");
  } finally {
    questions.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Setup failed: ${error.message}`);
    process.exitCode = 1;
  });
}
