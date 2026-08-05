import { fetchAndFilterRSS } from './rssFetcher.js';
import { summarizeArticleWithAI } from './aiSummarizer.js';
import { sendDigestToTelegram } from './telegramService.js';
import { logArticlesToSheet } from './sheetsLogger.js';
import { DEFAULT_RSS_SOURCES } from '../config/sources.js';

/**
 * Execute the full UPSC Daily Current Affairs Automation Workflow
 * @param {Object} options Configuration overrides (custom sources, hours, bot token, etc)
 */
export async function runWorkflow(options = {}) {
  const runId = `RUN-${Date.now()}`;
  const startTime = Date.now();
  console.log(`\n=================================================`);
  console.log(`🚀 Starting UPSC Daily Digest Workflow [${runId}]`);
  console.log(`=================================================`);

  const sources = options.sources || DEFAULT_RSS_SOURCES;
  const hours = options.hoursLookback || 24;
  const maxArticles = options.maxArticles || 25; // Top 25 articles per daily digest

  // Step 1: Fetch and Deduplicate RSS feeds
  console.log(`\n[Step 1/4] Fetching & Deduplicating RSS feeds (last ${hours}h)...`);
  const rssResult = await fetchAndFilterRSS(sources, hours);
  
  // Cap at top maxArticles for daily digest
  const selectedArticles = rssResult.articles.slice(0, maxArticles);
  console.log(`-> Fetched ${rssResult.totalFetched} raw items, ${rssResult.totalDeduplicated} unique items. Selected top ${selectedArticles.length} for daily digest.`);

  if (rssResult.articles.length === 0) {
    console.log(`⚠️ No new articles found in the last ${hours} hours. Workflow complete.`);
    return {
      runId,
      status: 'NO_ARTICLES',
      articlesProcessed: 0,
      executionTimeMs: Date.now() - startTime
    };
  }

  // Step 2: AI Summarization & Syllabus Tagging
  console.log(`\n[Step 2/4] Summarizing & Tagging ${selectedArticles.length} top articles...`);
  const articlesWithSummary = [];
  
  for (let i = 0; i < selectedArticles.length; i++) {
  const article = selectedArticles[i];
  console.log(
    `(${i + 1}/${selectedArticles.length}) ${article.title}`
  );
  const summary = await summarizeArticleWithAI(article);
  articlesWithSummary.push({
    ...article,
    summary
  });
}

articlesWithSummary.sort((a, b) => {
  const scoreA = a.summary?.importanceScore || 0;
  const scoreB = b.summary?.importanceScore || 0;

  if (scoreA !== scoreB) {
    return scoreB - scoreA; // Higher importance first
  }

  // If same importance, latest news first
  return new Date(b.pubDate) - new Date(a.pubDate);
});

console.log("\n========== AI Importance Ranking ==========");
console.table(
  articlesWithSummary.map(article => ({
    Score: article.summary.importanceScore,
    Level: article.summary.importanceLevel,
    Title: article.title.slice(0, 60)
  }))
);

  // Step 3: Telegram Delivery (Multi-message split if needed)
  console.log(`\n[Step 3/4] Delivering Digest to Telegram Channel/Group...`);
  let telegramResult = { success: false };
  try {
    telegramResult = await sendDigestToTelegram(
      articlesWithSummary,
      options.telegramBotToken,
      options.telegramChatId
    );
    console.log(`-> Telegram Delivery: ${telegramResult.simulated ? 'Simulated (No credentials)' : 'Sent successfully'} (${telegramResult.messagesCount} message parts).`);
  } catch (tgErr) {
    console.error(`❌ Telegram delivery failed: ${tgErr.message}`);
    telegramResult = { success: false, error: tgErr.message };
  }

  // Step 4: Google Sheets & Local Logging
  console.log(`\n[Step 4/4] Logging digest entries to Google Sheet / Local Database...`);
  const logResult = await logArticlesToSheet(runId, articlesWithSummary, telegramResult);
  console.log(`-> Logged ${logResult.loggedRows} items to DB.`);

  const totalTime = Date.now() - startTime;
  console.log(`\n=================================================`);
  console.log(`✅ Workflow Completed in ${(totalTime / 1000).toFixed(2)}s`);
  console.log(`=================================================\n`);

  return {
    runId,
    status: 'COMPLETED',
    articlesProcessed: articlesWithSummary.length,
    articles: articlesWithSummary,
    telegramResult,
    logResult,
    executionTimeMs: totalTime
  };
}
