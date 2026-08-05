import dotenv from 'dotenv';
dotenv.config();

/**
 * Heuristic/Rule-based categorization fallback when AI key is absent
 */
function heuristicCategorization(title, snippet) {
  const text = `${title} ${snippet}`.toLowerCase();
  
  if (text.match(/polity|constitution|parliament|bill|act|supreme court|judiciary|election|governance|panchayat|fundamental rights|article/i)) {
    return { topic: "Polity & Governance", gsPaper: "GS Paper 2", confidence: "heuristic" };
  }
  if (text.match(/gdp|rbi|inflation|economy|fiscal|tax|banking|trade|export|import|monetary|sebi|customs|budget/i)) {
    return { topic: "Economy & Agriculture", gsPaper: "GS Paper 3", confidence: "heuristic" };
  }
  if (text.match(/china|us|pakistan|un|g20|asean|bilateral|diplomacy|treaty|embassy|summit|quad|brics|foreign policy/i)) {
    return { topic: "International Relations", gsPaper: "GS Paper 2", confidence: "heuristic" };
  }
  if (text.match(/climate|biodiversity|forest|carbon|pollution|renewable|cop|tiger|wildlife|conservation|plastic|emission|species/i)) {
    return { topic: "Environment & Ecology", gsPaper: "GS Paper 3", confidence: "heuristic" };
  }
  if (text.match(/space|isro|nasa|ai|semiconductor|quantum|biotechnology|vaccine|disease|satellite|cyber|tech/i)) {
    return { topic: "Science & Technology", gsPaper: "GS Paper 3", confidence: "heuristic" };
  }
  if (text.match(/caste|women|education|health|poverty|tribal|demography|youth|disability|society/i)) {
    return { topic: "Indian Society", gsPaper: "GS Paper 1", confidence: "heuristic" };
  }
  if (text.match(/earthquake|flood|cyclone|landslide|monsoon|river|ocean|disaster|tsunami/i)) {
    return { topic: "Geography & Disaster Mgmt", gsPaper: "GS Paper 1", confidence: "heuristic" };
  }
  if (text.match(/temple|heritage|archaeology|monument|art|craft|history|freedom movement/i)) {
    return { topic: "History & Culture", gsPaper: "GS Paper 1", confidence: "heuristic" };
  }

  return { topic: "General Current Affairs", gsPaper: "GS Paper 2/3", confidence: "fallback" };
}

/**
 * Call OpenRouter REST API or use fallback rule engine
 */
export async function summarizeArticleWithAI(article) {
  const apiKey = process.env.OPENROUTER_API_KEY;

  // Fallback if no API key set
  if (!apiKey || apiKey === 'your_openrouter_api_key_here') {
    const heur = heuristicCategorization(article.title, article.snippet);
    return {
      topic: heur.topic,
      gsPaper: heur.gsPaper,
      context: article.snippet ? article.snippet.slice(0, 180) + '...' : article.title,
      keyPoints: [
        `Key issue covered: ${article.title}`,
        `Source: ${article.sourceName} (${article.sourceCategory})`,
        `Relevance: Important update for UPSC ${heur.gsPaper} syllabus.`
      ],
      mainsKeyword: `${heur.topic} - Key Trends`,
      practiceQuestion: `Examine the implications of recent developments regarding "${article.title}" for India's policy framework.`,
      aiGenerated: false
    };
  }

  try {
    // 4-second throttle to respect Gemini Free Tier 15 RPM rate limit
    await new Promise(r => setTimeout(r, 500));

    const prompt = `You are a senior UPSC Civil Services Exam mentor. Analyze the following news item and provide a structured JSON response tailored specifically for UPSC IAS aspirants.

News Title: "${article.title}"
News Source: ${article.sourceName}
Content/Snippet: "${article.snippet || article.fullContent.slice(0, 800)}"

Return ONLY a valid JSON object matching this schema (no markdown triple backticks around the json):
{
  "topic": "One of: Polity & Governance | Economy & Agriculture | International Relations | Environment & Ecology | Science & Technology | Indian Society | History & Culture | Geography & Disaster Mgmt | Ethics & Governance",
  "subTopic": "Specific UPSC syllabus topic",
  "gsPaper": "One of: GS Paper 1 | GS Paper 2 | GS Paper 3 | GS Paper 4",
  "context": "1 concise sentence explaining Why in News",
  "keyPoints": [
    "Bullet point 1: Crucial prelims fact/data/provision",
    "Bullet point 2: Analytical aspect for mains",
    "Bullet point 3: Policy implication or committee recommendation"
  ],
  "mainsKeyword": "Key UPSC Mains keyword/term associated with this topic",
  "practiceQuestion": "1 Mains/Prelims analytical question based on this news",
  "importanceScore": 1,
  "importanceLevel": "Must Read | Important | Moderate | Optional | Skip",
  "importanceReason": "One sentence explaining why this news matters for UPSC."
  "prelimsFocus": [
    "Keyword 1",
    "Keyword 2",
    "Keyword 3"
  ]
}
UPSC GS Paper Mapping (STRICT):

History & Culture → GS Paper 1
Indian Society → GS Paper 1
Geography & Disaster Mgmt → GS Paper 1

Polity & Governance → GS Paper 2
International Relations → GS Paper 2

Economy & Agriculture → GS Paper 3
Environment & Ecology → GS Paper 3
Science & Technology → GS Paper 3
Disaster Management → GS Paper 3

Ethics & Governance → GS Paper 4

The gsPaper MUST exactly match the selected topic.

Importance Scoring Rules:

5 = Must Read
- Constitutional amendments
- Supreme Court landmark judgments
- RBI monetary policy
- Budget
- Economic Survey
- International treaties
- Ramsar Sites
- Climate conventions
- National security

4 = Important
- Government schemes
- Bills
- Parliamentary committees
- NITI Aayog reports
- International summits

3 = Moderate
- Sector-specific reforms
- State-level developments

2 = Optional
- Routine administration

1 = Skip
- Ceremonial speeches
- Routine appointments
- Political statements with low UPSC relevance

Return ONLY valid JSON.  
`;

    let res;

for (let attempt = 1; attempt <= 2; attempt++) {

  res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "UPSC Daily Digest"
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b:free",
      response_format: {
        type: "json_object"
      },
      messages: [
        {
          role: "system",
          content: "You are an expert UPSC Current Affairs Mentor. Always return valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2
    })
  });

  if (res.ok) {
    break;
  }

  if (res.status === 429 && attempt < 2) {
    console.log("⏳ Rate limited. Waiting 25 seconds before retry...");
    await new Promise(resolve => setTimeout(resolve, 25000));
    continue;
  }

  throw new Error(`OpenRouter API error ${res.status}: ${await res.text()}`);
}
    const data = await res.json();
    const rawText = data.choices?.[0]?.message?.content;
    if (!rawText) {
      throw new Error("Empty response from OpenRouter");
    }
    const cleaned = rawText
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`Model returned invalid JSON:\n${cleaned}`);
    }
    
    return {
      ...parsed,
      aiGenerated: true
    };
  } catch (err) {
    console.warn(`[AI Warning] OpenRouter API call failed for "${article.title}": ${err.message}. Using fallback.`);
    const heur = heuristicCategorization(article.title, article.snippet);
    return {
      topic: heur.topic,
      gsPaper: heur.gsPaper,
      context: article.snippet ? article.snippet.slice(0, 180) + '...' : article.title,
      keyPoints: [
        `Key issue covered: ${article.title}`,
        `Source: ${article.sourceName}`
      ],
      mainsKeyword: heur.topic,
      practiceQuestion: `Analyze the relevance of ${article.title} in the context of ${heur.topic}.`,
      aiGenerated: false
    };
  }
}
