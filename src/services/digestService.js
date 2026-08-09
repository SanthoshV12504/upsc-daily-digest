import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const DIGEST_FILE = path.join(
  process.cwd(),
  "data",
  "digest_history.json"
);

const GOOGLE_SHEET_API_URL = process.env.GOOGLE_SHEET_API_URL;

// --------------------------------------------------
// Load articles from Google Sheet
// --------------------------------------------------

async function loadDigestFromGoogleSheet() {
  if (!GOOGLE_SHEET_API_URL) {
    console.warn("GOOGLE_SHEET_API_URL not configured");
    return [];
  }

  try {
    const response = await fetch(GOOGLE_SHEET_API_URL);

    if (!response.ok) {
      throw new Error(
        `Google Sheet API returned ${response.status}`
      );
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Google Sheet API did not return an array");
    }

    console.log(
      `[Google Sheet] Loaded ${data.length} articles`
    );

    return data;

  } catch (err) {
    console.error(
      "[Google Sheet] Failed to load articles:",
      err.message
    );

    return [];
  }
}

// --------------------------------------------------
// Local fallback
// --------------------------------------------------

function loadLocalDigest() {
  try {
    if (!fs.existsSync(DIGEST_FILE)) {
      return [];
    }

    const data = fs.readFileSync(DIGEST_FILE, "utf-8");

    return JSON.parse(data);

  } catch (err) {
    console.error("Error loading local digest:", err);
    return [];
  }
}

// --------------------------------------------------
// Get all articles
// --------------------------------------------------

export async function getAllArticles() {

  const googleArticles = await loadDigestFromGoogleSheet();

  if (googleArticles.length > 0) {
    return googleArticles;
  }

  console.warn(
    "[Digest] Google Sheet empty/unavailable. Using local database."
  );

  return loadLocalDigest();
}

// --------------------------------------------------
// Today's articles
// --------------------------------------------------

export async function getTodayArticles() {

  const articles = await getAllArticles();

  const today = new Date().toLocaleDateString("en-IN");

  return articles.filter(article => {

    if (!article.date) return false;

    const articleDate = new Date(article.date)
      .toLocaleDateString("en-IN");

    return articleDate === today;
  });
}

// --------------------------------------------------
// Top articles
// --------------------------------------------------

export async function getTopArticles(limit = 5) {

  const articles = await getAllArticles();

  return articles.slice(0, limit);
}

// --------------------------------------------------
// Filter by topic
// --------------------------------------------------

export async function getArticlesByTopic(topic) {

  const articles = await getAllArticles();

  return articles.filter(article =>
    article.topic
      ?.toLowerCase()
      .includes(topic.toLowerCase())
  );
}

// --------------------------------------------------
// Filter by GS Paper
// --------------------------------------------------

export async function getArticlesByPaper(paper) {

  const articles = await getAllArticles();

  return articles.filter(article =>
    article.gsPaper
      ?.toLowerCase()
      .includes(paper.toLowerCase())
  );
}

// --------------------------------------------------
// Search
// --------------------------------------------------

export async function searchArticles(keyword) {

  const articles = await getAllArticles();

  keyword = keyword.toLowerCase();

  return articles.filter(article =>
    article.title?.toLowerCase().includes(keyword) ||
    article.context?.toLowerCase().includes(keyword) ||
    article.mainsKeyword?.toLowerCase().includes(keyword)
  );
}
