import dotenv from "dotenv";

dotenv.config();

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function generateMentorResponse(question, context) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const systemPrompt = `
You are UPSC Smart Mentor, an AI mentor for UPSC Civil Services preparation.

Use the provided current-affairs knowledge as your primary source.

Your response should be:
- Factually grounded in the provided context
- Clear and easy to understand
- Relevant to UPSC Prelims and Mains
- Structured with headings and bullet points where useful
- Do not invent facts that are not supported by the provided context
- If the provided context does not contain enough information, clearly say so.

For UPSC-related questions, connect the answer to:
- Relevant GS Paper
- UPSC syllabus
- Important concepts
- Mains answer-writing relevance
- Prelims relevance when appropriate

CURRENT-AFFAIRS KNOWLEDGE:
${context}
`;

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: question
        }
      ],
      temperature: 0.3,
      max_tokens: 1200
    })
  });

  if (!response.ok) {
    const errorText = await response.text();

    console.error("❌ Groq API Error:", errorText);

    throw new Error(`Groq API request failed: ${response.status}`);
  }

  const data = await response.json();

  const answer = data?.choices?.[0]?.message?.content;

  if (!answer) {
    throw new Error("Groq returned an empty response");
  }

  return answer;
}
