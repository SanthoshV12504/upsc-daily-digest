import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const DIGEST_FILE = path.join(
  process.cwd(),
  "data",
  "digest_history.json"
);

const GOOGLE_SHEET_API_URL =
  process.env.GOOGLE_SHEET_API_URL;


// --------------------------------------------------
// Parse DD/MM/YYYY date
// Example: 9/8/2026 = 9 August 2026
// --------------------------------------------------

function parseIndianDate(dateString) {
  if (!dateString) return 0;

  const parts = dateString.split("/");

  if (parts.length !== 3) {
    return 0;
  }

  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = Number(parts[2]);

  if (!day || !month || !year) {
    return 0;
  }

  return new Date(
    year,
    month - 1,
    day
  ).getTime();
}


// --------------------------------------------------
// Load articles from Google Sheet
// --------------------------------------------------

async function loadDigestFromGoogleSheet() {

  if (!GOOGLE_SHEET_API_URL) {
    console.warn(
      "GOOGLE_SHEET_API_URL not configured"
    );

    return [];
  }

  try {

    const response = await fetch(
      GOOGLE_SHEET_API_URL
    );

    if (!response.ok) {
      throw new Error(
        `Google Sheet API returned ${response.status}`
      );
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error(
        "Google Sheet API did not return an array"
      );
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

    const data = fs.readFileSync(
      DIGEST_FILE,
      "utf-8"
    );

    return JSON.parse(data);

  } catch (err) {

    console.error(
      "Error loading local digest:",
      err
    );

    return [];
  }
}


// --------------------------------------------------
// Get all articles
// --------------------------------------------------

export async function getAllArticles() {

  const googleArticles =
    await loadDigestFromGoogleSheet();

  // If Google Sheet has data,
  // sort latest date first
  if (googleArticles.length > 0) {

    return googleArticles.sort((a, b) => {

      return (
        parseIndianDate(b.date) -
        parseIndianDate(a.date)
      );

    });
  }

  // Google Sheet unavailable/empty
  console.warn(
    "[Digest] Google Sheet empty/unavailable. Using local database."
  );

  return loadLocalDigest();
}


// --------------------------------------------------
// Get today's articles
// --------------------------------------------------

export async function getTodayArticles() {

  const articles =
    await getAllArticles();

  const now = new Date();

  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();

  return articles.filter(article => {

    if (!article.date) {
      return false;
    }

    return (
      parseIndianDate(article.date) === today
    );

  });
}


// --------------------------------------------------
// Get top articles
// --------------------------------------------------

export async function getTopArticles(
  limit = 5
) {

  const articles =
    await getAllArticles();

  return articles.slice(0, limit);
}


// --------------------------------------------------
// Get articles by topic
// --------------------------------------------------

export async function getArticlesByTopic(topic) {

  const articles =
    await getAllArticles();

  return articles.filter(article =>

    article.topic
      ?.toLowerCase()
      .includes(topic.toLowerCase())

  );
}


// --------------------------------------------------
// Get articles by GS Paper
// --------------------------------------------------

export async function getArticlesByPaper(paper) {

  const articles =
    await getAllArticles();

  return articles.filter(article =>

    article.gsPaper
      ?.toLowerCase()
      .includes(paper.toLowerCase())

  );
}


// --------------------------------------------------
// Search articles
// --------------------------------------------------

export async function searchArticles(keyword) {

  const articles =
    await getAllArticles();

  keyword =
    keyword.toLowerCase();

  return articles.filter(article =>

    article.title
      ?.toLowerCase()
      .includes(keyword) ||

    article.context
      ?.toLowerCase()
      .includes(keyword) ||

    article.mainsKeyword
      ?.toLowerCase()
      .includes(keyword)

  );
}
