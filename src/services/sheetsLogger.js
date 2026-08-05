import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LOCAL_DB_PATH = path.join(DATA_DIR, 'digest_history.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(LOCAL_DB_PATH)) {
  fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify([], null, 2));
}

/**
 * Append run logs to Google Sheets (if credentials configured) and Local JSON DB
 */
export async function logArticlesToSheet(runId, articles, telegramStatus) {
  const timestamp = new Date().toISOString();
  const dateStr = new Date().toLocaleDateString('en-IN');

  const rows = articles.map(art => ({
    runId,
    timestamp,
    date: dateStr,
    title: art.title,
    source: art.sourceName,
    topic: art.summary?.topic || 'General',
    gsPaper: art.summary?.gsPaper || 'GS Paper 2',
    context: art.summary?.context || '',
    mainsKeyword: art.summary?.mainsKeyword || '',
    url: art.link,
    telegramDelivered: telegramStatus?.success ? (telegramStatus.simulated ? 'Simulated' : 'Sent') : 'Failed'
  }));

  // Always update local database file
  let existing = [];
  try {
    const fileData = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
    existing = JSON.parse(fileData);
  } catch (err) {
    existing = [];
  }

  const updated = [...rows, ...existing];
  fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(updated, null, 2));

  // If Google Sheets Webhook URL is supplied, log via HTTP POST
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  let sheetLogged = false;

  if (webhookUrl) {
    try {
      console.log(`[Google Sheets] Sending ${rows.length} rows to Google Sheet Webhook...`);
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows)
      });
      console.log(`[Google Sheets] Webhook response status: ${res.status}`);
      sheetLogged = true;
    } catch (err) {
      console.warn(`[Google Sheets Warning] Google Sheets Webhook failed: ${err.message}`);
    }
  } else {
    console.log(`[Google Sheets] Saved to local database: data/digest_history.json. Add GOOGLE_SHEET_WEBHOOK_URL in .env to auto-populate Google Sheets.`);
  }

  return {
    localCount: updated.length,
    loggedRows: rows.length,
    sheetLogged,
    localDbPath: LOCAL_DB_PATH
  };
}

/**
 * Get history logs
 */
export function getDigestHistory(limit = 50) {
  try {
    const fileData = fs.readFileSync(LOCAL_DB_PATH, 'utf-8');
    const data = JSON.parse(fileData);
    return data.slice(0, limit);
  } catch (err) {
    return [];
  }
}
