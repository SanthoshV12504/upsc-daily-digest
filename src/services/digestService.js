import fs from "fs";
import path from "path";

const DIGEST_FILE = path.join(process.cwd(), "data", "digest_history.json");

function loadDigest() {
  try {
    if (!fs.existsSync(DIGEST_FILE)) return [];

    const data = fs.readFileSync(DIGEST_FILE, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error loading digest:", err);
    return [];
  }
}

export function getAllArticles() {
  return loadDigest();
}

export function getTodayArticles() {
  const today = new Date().toLocaleDateString("en-IN");
  return loadDigest().filter(article => article.date === today);
}

export function getTopArticles(limit = 5) {
  return loadDigest().slice(0, limit);
}

export function getArticlesByTopic(topic) {
  return loadDigest().filter(article =>
    article.topic?.toLowerCase().includes(topic.toLowerCase())
  );
}

export function getArticlesByPaper(paper) {
  return loadDigest().filter(article =>
    article.gsPaper?.toLowerCase().includes(paper.toLowerCase())
  );
}

export function searchArticles(keyword) {
  keyword = keyword.toLowerCase();

  return loadDigest().filter(article =>
    article.title?.toLowerCase().includes(keyword) ||
    article.context?.toLowerCase().includes(keyword) ||
    article.mainsKeyword?.toLowerCase().includes(keyword)
  );
}