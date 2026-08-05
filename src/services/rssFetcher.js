import Parser from 'rss-parser';

const parser = new Parser({
  customFields: {
    item: ['description', 'content:encoded', 'pubDate', 'dc:date']
  },
  timeout: 10000,
});

/**
 * Calculates string similarity using Jaccard index on word n-grams
 */
function calculateTitleSimilarity(title1, title2) {
  const normalize = (str) =>
    str.toLowerCase()
      .replace(/[^\w\s]/gi, '')
      .split(/\s+/)
      .filter(w => w.length > 3);

  const words1 = new Set(normalize(title1));
  const words2 = new Set(normalize(title2));

  if (words1.size === 0 || words2.size === 0) return 0;

  let intersection = 0;
  for (const word of words1) {
    if (words2.has(word)) intersection++;
  }

  const union = new Set([...words1, ...words2]).size;
  return intersection / union;
}

/**
 * Strip HTML tags from text
 */
function cleanHtml(htmlStr) {
  if (!htmlStr) return '';
  return htmlStr
    .replace(/<[^>]*>?/gm, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch and filter articles from multiple RSS sources
 * @param {Array} sources List of RSS feed sources
 * @param {number} hoursLookback Maximum age of article in hours (default 24)
 */
function balanceArticlesBySource(articles) {
  const limits = {
    "PIB (Press Information Bureau)": 4,
    "The Hindu - National": 6,
    "Indian Express - Explained": 5,
    "Business Standard - Economy": 4,
    "Business Standard - Banking": 3,
    "Mongabay India": 3
  };

  const TARGET_TOTAL = 25;

  const grouped = {};
  const balanced = [];
  const leftovers = [];

  // Group articles by source
  for (const article of articles) {
    if (!grouped[article.sourceName]) {
      grouped[article.sourceName] = [];
    }
    grouped[article.sourceName].push(article);
  }

  // Take quota from each source
  for (const [source, max] of Object.entries(limits)) {
    const sourceArticles = grouped[source] || [];

    balanced.push(...sourceArticles.slice(0, max));

    // Store remaining articles
    leftovers.push(...sourceArticles.slice(max));
  }

  // Sort remaining articles by latest
  leftovers.sort(
    (a, b) => new Date(b.pubDate) - new Date(a.pubDate)
  );

  // Fill remaining slots
  while (
    balanced.length < TARGET_TOTAL &&
    leftovers.length > 0
  ) {
    balanced.push(leftovers.shift());
  }

  // Final sort
  balanced.sort(
    (a, b) => new Date(b.pubDate) - new Date(a.pubDate)
  );

  return balanced;
}

async function fetchFeed(source) {
  const isBusinessStandard = source.name.startsWith("Business Standard");

  if (!isBusinessStandard) {
    return await parser.parseURL(source.url);
  }

  console.log(`[RSS] Fetching Business Standard using browser headers...`);

  const response = await fetch(source.url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",
      "Accept": "application/rss+xml, application/xml, text/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const xml = await response.text();

  return await parser.parseString(xml);
}


export async function fetchAndFilterRSS(sources, hoursLookback = 24) {
  const cutoffTime = Date.now() - (hoursLookback * 60 * 60 * 1000);
  const rawArticles = [];
  const errors = [];

  for (const source of sources) {
    if (!source.enabled) continue;
    try {
      console.log(source.url);
      const feed = await fetchFeed(source);
      console.log(
        `[RSS] ${source.name}: ${feed.items?.length || 0} articles`
      );

      for (const item of feed.items || []) {
        const pubDateStr = item.pubDate || item['dc:date'] || item.isoDate;
        const pubTime = pubDateStr ? new Date(pubDateStr).getTime() : Date.now();

        // Include if published within cutoff window (or if no valid date found, allow item if recent)
        if (isNaN(pubTime) || pubTime >= cutoffTime) {
          rawArticles.push({
            id: `${source.id}-${Buffer.from(item.link || item.title || '').toString('hex').slice(0, 10)}`,
            title: cleanHtml(item.title || 'Untitled Article'),
            link: item.link || '',
            snippet: cleanHtml(item.contentSnippet || item.description || item['content:encoded'] || '').slice(0, 500),
            fullContent: cleanHtml(item['content:encoded'] || item.description || item.contentSnippet || ''),
            sourceName: source.name,
            sourceCategory: source.category,
            pubDate: isNaN(pubTime) ? new Date().toISOString() : new Date(pubTime).toISOString()
          });
        }
      }
    } catch (err) {
      console.warn(`[RSS Warning] Failed to fetch feed for ${source.name}: ${err.message}`);
      errors.push({ source: source.name, error: err.message });
    }
  }
  console.log("[RSS] Total Raw Articles:", rawArticles.length);
  console.log("[RSS] Errors:", errors);

  // Deduplicate articles
  const deduplicated = [];

  for (const article of rawArticles) {
    // Check if link already exists or title is highly similar to existing item
    const isDuplicate = deduplicated.some(existing => {
      if (existing.link && article.link && existing.link === article.link) return true;
      const similarity = calculateTitleSimilarity(existing.title, article.title);
      return similarity >= 0.65; // 65%+ word similarity considered duplicate news
    });

    if (!isDuplicate) {
      deduplicated.push(article);
    }
  }
    // Sort by latest publication date first
    deduplicated.sort((a, b) =>
      new Date(b.pubDate) - new Date(a.pubDate)
    );
  // Balance articles across sources
  const balancedArticles = balanceArticlesBySource(deduplicated);
  console.log("\n========== Source Distribution ==========");
  const distribution = {};
  for (const article of balancedArticles) {
  distribution[article.sourceName] =
    (distribution[article.sourceName] || 0) + 1;
  }
  console.table(distribution);
  return {
    articles: balancedArticles,
    totalFetched: rawArticles.length,
    totalDeduplicated: deduplicated.length,
    errors
  };    
}
