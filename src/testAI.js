import { summarizeArticleWithAI } from "./services/aiSummarizer.js";

const article = {
  title: "Glaw Lake becomes Arunachal Pradesh's First Ramsar Site; India's Ramsar Sites tally reaches 101",
  snippet:
    "Glaw Lake has been designated as India's 101st Ramsar Site, highlighting the country's commitment to wetland conservation.",
  sourceName: "PIB (Press Information Bureau)",
  sourceCategory: "Environment"
};

const result = await summarizeArticleWithAI(article);

console.log(JSON.stringify(result, null, 2));