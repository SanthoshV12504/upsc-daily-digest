import express from 'express';
import cron from 'node-cron';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { runWorkflow } from './services/workflowEngine.js';
import { DEFAULT_RSS_SOURCES, UPSC_SYLLABUS_TOPICS } from './config/sources.js';
import { getDigestHistory } from './services/sheetsLogger.js';
import { splitDigestIntoMessages } from './services/telegramService.js';
import {
  getAllArticles,
  getTodayArticles,
  getTopArticles,
  getArticlesByTopic,
  getArticlesByPaper,
  searchArticles
} from "./services/digestService.js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), 'public')));

let activeSources = [...DEFAULT_RSS_SOURCES];
let lastRunResult = null;
let isRunning = false;
let activeCronJob = null;

// Helper to save env vars to .env file
function updateEnvFile(updates) {
  const envPath = path.resolve(process.cwd(), '.env');
  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
  }

  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
    process.env[key] = value;
  }

  fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
}

// -------------------------------------------------------------
// API ENDPOINTS
// -------------------------------------------------------------

// 1. Get system status & dashboard info
app.get('/api/status', (req, res) => {
  res.json({
    isRunning,
    lastRunResult,
    sourcesCount: activeSources.filter(s => s.enabled).length,
    totalSources: activeSources.length,
    config: {
      hasTelegramToken: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'your_telegram_bot_token_here'),
      telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
      hasOpenRouterKey: Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== 'your_openrouter_api_key_here'),
      hasGoogleSheet: Boolean(process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SHEET_ID !== 'your_google_sheet_id_here'),
      cronSchedule: process.env.CRON_SCHEDULE || '0 7 * * *'
    }
  });
});

// 2. Trigger workflow manually
app.post('/api/trigger', async (req, res) => {
  if (isRunning) {
    return res.status(400).json({ error: 'Workflow is already running' });
  }

  isRunning = true;
  const hours = req.body.hours || 48; // default to 48 hours for test trigger to get rich data

  try {
    const result = await runWorkflow({
      sources: activeSources,
      hoursLookback: hours,
      telegramBotToken: req.body.telegramBotToken,
      telegramChatId: req.body.telegramChatId
    });
    lastRunResult = result;
    isRunning = false;
    res.json(result);
  } catch (err) {
    isRunning = false;
    res.status(500).json({ error: err.message });
  }
});

// 3. Get RSS sources
app.get('/api/sources', (req, res) => {
  res.json(activeSources);
});

// 4. Update RSS sources
app.post('/api/sources', (req, res) => {
  if (Array.isArray(req.body)) {
    activeSources = req.body;
    return res.json({ success: true, sources: activeSources });
  }
  res.status(400).json({ error: 'Invalid payload' });
});

// 5. Get History Logs
app.get('/api/history', (req, res) => {
  const limit = parseInt(req.query.limit || '50', 10);
  const history = getDigestHistory(limit);
  res.json(history);
});

// 6. Get Telegram Preview for current articles
app.post('/api/telegram-preview', (req, res) => {
  const articles = req.body.articles || (lastRunResult?.articles || []);
  if (!articles || articles.length === 0) {
    return res.json({ messages: ['<i>No articles loaded. Run the workflow or select sample articles.</i>'] });
  }
  const messages = splitDigestIntoMessages(articles);
  res.json({ messages, totalParts: messages.length });
});

// 7. Update Configuration (.env settings)
app.post('/api/config', (req, res) => {
  const { telegramBotToken, telegramChatId, openRouterApiKey, googleSheetId, cronSchedule } = req.body;
  const updates = {};
  
  if (telegramBotToken !== undefined) updates.TELEGRAM_BOT_TOKEN = telegramBotToken;
  if (telegramChatId !== undefined) updates.TELEGRAM_CHAT_ID = telegramChatId;
  if (openRouterApiKey !== undefined) updates.OPENROUTER_API_KEY = openRouterApiKey;
  if (googleSheetId !== undefined) updates.GOOGLE_SHEET_ID = googleSheetId;
  if (cronSchedule !== undefined) updates.CRON_SCHEDULE = cronSchedule;

  updateEnvFile(updates);

  // Restart Cron if cron schedule updated
  if (cronSchedule) {
    setupCronSchedule(cronSchedule);
  }

  res.json({ success: true, message: 'Settings saved successfully' });
});

// 8. Topics list
app.get('/api/topics', (req, res) => {
  res.json(UPSC_SYLLABUS_TOPICS);
});

// Setup Node-Cron Scheduler
function setupCronSchedule(scheduleStr = process.env.CRON_SCHEDULE || '0 7 * * *') {
  if (activeCronJob) {
    activeCronJob.stop();
    activeCronJob = null;
  }

  if (cron.validate(scheduleStr)) {
    console.log(`[Cron Scheduler] Initializing daily schedule: "${scheduleStr}"`);
    activeCronJob = cron.schedule(scheduleStr, async () => {
      console.log(`[Cron Trigger] Daily scheduled run executing at ${new Date().toISOString()}`);
      try {
        await runWorkflow({ sources: activeSources, hoursLookback: 24 });
      } catch (err) {
        console.error(`[Cron Error] Workflow execution failed:`, err);
      }
    });
  } else {
    console.warn(`[Cron Scheduler] Invalid cron format "${scheduleStr}". Cron disabled.`);
  }
}

// =====================================================
// DIGEST API
// =====================================================

// Get today's digest
app.get("/api/digest/today", (req, res) => {
  res.json(getTodayArticles());
});

// Get Top 5 articles
app.get("/api/digest/top5", (req, res) => {
  res.json(getTopArticles(5));
});

// Get all articles
app.get("/api/digest", (req, res) => {
  const { topic, paper } = req.query;

  if (topic) {
    return res.json(getArticlesByTopic(topic));
  }

  if (paper) {
    return res.json(getArticlesByPaper(paper));
  }

  res.json(getAllArticles());
});

// Search
app.get("/api/digest/search", (req, res) => {
  const q = req.query.q;

  if (!q) {
    return res.status(400).json({
      error: "Search keyword is required"
    });
  }

  res.json(searchArticles(q));
});

export function startServer(port = process.env.PORT || 3000) {
  setupCronSchedule();
  app.listen(port, () => {
    console.log(`\n=================================================`);
    console.log(`🏛️  UPSC Daily Digest Server running at: http://localhost:${port}`);
    console.log(`=================================================\n`);
  });
}
