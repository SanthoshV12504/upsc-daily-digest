import dotenv from 'dotenv';
dotenv.config();

/**
 * Escapes HTML characters for Telegram HTML parse mode
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Returns a badge string based on the importance score of the article
 */
function getImportanceBadge(score) {
  switch (score) {
    case 5:
      return "🟥 ★★★★★ MUST READ";
    case 4:
      return "🟧 ★★★★☆ IMPORTANT";
    case 3:
      return "🟨 ★★★☆☆ MODERATE";
    case 2:
      return "🟦 ★★☆☆☆ OPTIONAL";
    default:
      return "⬜ ★☆☆☆☆ SKIP";
  }
}

/**
 * Format a single article into a clean Telegram HTML card
 */
export function formatArticleHtml(article, index) {
  const summary = article.summary || {};
  const importanceBadge = getImportanceBadge(summary.importanceScore);
  const topicBadge = summary.topic ? `<b>[${escapeHtml(summary.topic)}]</b>` : '<b>[General]</b>';
  const paperBadge = summary.gsPaper ? `<i>(${escapeHtml(summary.gsPaper)})</i>` : '';
  
  let html = `${importanceBadge}\n\n`;
  html += `<b>${index}. ${escapeHtml(article.title)}</b>\n`;
  html += `🏷️ ${topicBadge} ${paperBadge}\n`;
  html += `📰 <i>Source: ${escapeHtml(article.sourceName)}</i>\n\n`;

  if (summary.context) {
    html += `📌 <b>Why in News:</b> ${escapeHtml(summary.context)}\n\n`;
  }

  if (summary.keyPoints && summary.keyPoints.length > 0) {
    html += `💡 <b>Key Highlights for Prelims & Mains:</b>\n`;
    for (const point of summary.keyPoints) {
      html += `• ${escapeHtml(point)}\n`;
    }
    html += `\n`;
  }

  if (summary.mainsKeyword) {
    html += `🔑 <b>Mains Concept:</b> <code>${escapeHtml(summary.mainsKeyword)}</code>\n`;
  }

  if (summary.practiceQuestion) {
    html += `❓ <b>Practice Question:</b> <i>${escapeHtml(summary.practiceQuestion)}</i>\n`;
  }

  if (article.link) {
    html += `🔗 <a href="${escapeHtml(article.link)}">Read Full Source Article</a>\n`;
  }

  return html;
}

/**
 * Splits formatted html chunks into messages <= 4000 characters
 * respecting Telegram's 4096 character limit per API call.
 */
export function splitDigestIntoMessages(articles, dateStr = new Date().toLocaleDateString('en-IN')) {
  const messages = [];

  const headerText = `📚 <b>UPSC DAILY CURRENT AFFAIRS DIGEST</b>\n🗓️ <b>Date: ${dateStr}</b>\n───────────────────────────────\n<i>Total Articles Analyzed: ${articles.length}</i>\n\n`;
  
  let currentMsg = headerText;

  for (let i = 0; i < articles.length; i++) {
    const articleHtml = formatArticleHtml(articles[i], i + 1) + `\n───────────────────────────────\n\n`;
    
    // Check if adding this article exceeds 3800 chars (safe headroom under 4096)
    if (currentMsg.length + articleHtml.length > 3800) {
      messages.push(currentMsg.trim());
      currentMsg = `📚 <b>UPSC DIGEST (Contd. Part ${messages.length + 1})</b>\n───────────────────────────────\n\n` + articleHtml;
    } else {
      currentMsg += articleHtml;
    }
  }

  if (currentMsg.trim().length > 0) {
    // Append footer to final part
    currentMsg += `🎯 <i>Stay focused! Consistency is the key to UPSC Civil Services Success.</i>`;
    messages.push(currentMsg.trim());
  }

  return messages;
}

/**
 * Send digest to Telegram using Bot API
 */
export async function sendDigestToTelegram(articles, customBotToken, customChatId) {
  const token = customBotToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = customChatId || process.env.TELEGRAM_CHAT_ID;

  if (!token || token === 'your_telegram_bot_token_here' || !chatId || chatId === 'your_telegram_chat_id_here') {
    console.log('[Telegram Service] No valid Bot Token or Chat ID provided. Simulating output locally.');
    const messages = splitDigestIntoMessages(articles);
    return {
      success: true,
      simulated: true,
      messagesCount: messages.length,
      preview: messages
    };
  }

  const messages = splitDigestIntoMessages(articles);
  const sentResults = [];

  for (let idx = 0; idx < messages.length; idx++) {
    const msgText = messages[idx];
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: msgText,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    const resData = await response.json();
    if (!resData.ok) {
      throw new Error(`Telegram API Error on Part ${idx + 1}: ${resData.description || 'Unknown error'}`);
    }

    sentResults.push(resData.result);

    // Delay 1 second between parts to avoid Telegram rate limits
    if (idx < messages.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  return {
    success: true,
    simulated: false,
    messagesCount: messages.length,
    sentResults
  };
}
