let currentSources = [];
let currentTelegramParts = [];
let currentPartIdx = 0;

document.addEventListener('DOMContentLoaded', () => {
  loadStatus();
  loadSources();
  loadHistory();
});

// Tab Switcher
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const activeBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick')?.includes(tabId));
  if (activeBtn) activeBtn.classList.add('active');

  const content = document.getElementById(`tab-${tabId}`);
  if (content) content.classList.add('active');

  if (tabId === 'telegram') loadTelegramPreview();
  if (tabId === 'history') loadHistory();
  if (tabId === 'sources') loadSources();
}

// Load System Status
async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    document.getElementById('stat-sources').innerText = `${data.sourcesCount} Active`;
    const cronText = data.config.cronSchedule === '0 7 * * *' ? '07:00 AM IST' : data.config.cronSchedule;
    document.getElementById('stat-cron').innerText = cronText;

    const tgStat = document.getElementById('stat-telegram');
    if (data.config.hasTelegramToken) {
      tgStat.innerText = 'Connected';
      tgStat.style.color = 'var(--accent-emerald)';
    } else {
      tgStat.innerText = 'Simulated';
      tgStat.style.color = 'var(--accent-amber)';
    }

    const aiStat = document.getElementById('stat-ai');
    if (data.config.hasOpenRouterKey) {
      aiStat.innerText = 'OpenRouter\n(GPT-OSS-20B)';
      aiStat.style.color = 'var(--accent-blue)';
    } else {
      aiStat.innerText = 'Heuristic Engine';
      aiStat.style.color = 'var(--accent-amber)';
    }

    // Fill settings inputs
    /*document.getElementById('cfg-telegram-chat').value = data.config.telegramChatId || '';
    document.getElementById('cfg-cron-schedule').value = data.config.cronSchedule || '0 7 * * *';*/

    if (data.lastRunResult?.articles) {
      renderArticles(data.lastRunResult.articles);
    }
  } catch (err) {
    console.error('Failed to fetch status:', err);
  }
}

// Load RSS Sources
async function loadSources() {
  try {
    const res = await fetch('/api/sources');
    currentSources = await res.json();
    
    const container = document.getElementById('sources-list-grid');
    if (!container) return;

    container.innerHTML = currentSources.map((s, idx) => `
      <div class="feed-card">
        <div>
          <div class="feed-title">${escapeHtml(s.name)}</div>
          <div class="feed-cat">${escapeHtml(s.category)}</div>
          <!-- <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.2rem; word-break: break-all;">${escapeHtml(s.url)}</div> -->
        </div>
        <label class="switch">
          <input type="checkbox" ${s.enabled ? 'checked' : ''} onchange="toggleSource(${idx})">
          <span class="slider"></span>
        </label>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load sources:', err);
  }
}

async function toggleSource(idx) {
  currentSources[idx].enabled = !currentSources[idx].enabled;
  await fetch('/api/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(currentSources)
  });
  loadStatus();
}

// ------------------------------
// Workflow Progress UI
// ------------------------------

function resetWorkflowProgress() {

    document.getElementById("workflow-progress").style.display = "flex";

    const ids = [
        "step-rss",
        "step-dedupe",
        "step-ai",
        "step-telegram",
        "step-sheet"
    ];

    ids.forEach(id => {

        const step = document.getElementById(id);

        step.classList.remove("active");

        const status = step.querySelector(".step-status");

        status.className = "step-status waiting";
        status.innerHTML = "⚪ Waiting";

    });

}

function startStep(id) {

    const step = document.getElementById(id);

    step.classList.add("active");

    const status = step.querySelector(".step-status");

    status.className = "step-status running";
    status.innerHTML = "🟡 Running";

}

function completeStep(id) {

    const step = document.getElementById(id);

    step.classList.remove("active");

    const status = step.querySelector(".step-status");

    status.className = "step-status completed";
    status.innerHTML = "🟢 Completed";

}

// Trigger Daily Workflow Execution
async function triggerWorkflow() {
  resetWorkflowProgress();
  startStep("step-rss");
  const btn = document.getElementById('btn-trigger');
  const consoleBox = document.getElementById('console-output');
  const consoleLogs = document.getElementById('console-logs');

  btn.disabled = true;
  btn.innerHTML = `<span>⏳ Processing Workflow...</span>`;
  consoleBox.style.display = 'block';
  consoleLogs.innerHTML = `> [${new Date().toLocaleTimeString()}] Launching RSS Fetching & Deduplication...\n`;

  try {
    const res = await fetch('/api/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hours: 48 }) // test with 48h to ensure articles are fetched
    });

    const result = await res.json();

    if (!res.ok) throw new Error(result.error || 'Workflow trigger failed');
    completeStep("step-rss");

    startStep("step-dedupe");
    await new Promise(r => setTimeout(r, 400));
    completeStep("step-dedupe");

    startStep("step-ai");
    await new Promise(r => setTimeout(r, 600));
    completeStep("step-ai");

    startStep("step-telegram");
    await new Promise(r => setTimeout(r, 400));
    completeStep("step-telegram");

    startStep("step-sheet");
    await new Promise(r => setTimeout(r, 300));
    completeStep("step-sheet"); 

    consoleLogs.innerHTML += `> [${new Date().toLocaleTimeString()}] RSS Fetch Completed: ${result.articlesProcessed} articles deduplicated.\n`;
    consoleLogs.innerHTML += `> [${new Date().toLocaleTimeString()}] AI Tagging & Summarization Complete.\n`;
    consoleLogs.innerHTML += `> [${new Date().toLocaleTimeString()}] Telegram Delivery: ${result.telegramResult?.simulated ? 'Simulated Preview Ready' : 'Delivered to Telegram'}\n`;
    consoleLogs.innerHTML += `> [${new Date().toLocaleTimeString()}] Logged entries to database.\n`;
    consoleLogs.innerHTML += `> ✅ WORKFLOW COMPLETE in ${(result.executionTimeMs / 1000).toFixed(2)}s\n`;

    if (result.articles) {
      renderArticles(result.articles);
    }
    loadStatus();
    loadHistory();
  } catch (err) {
    consoleLogs.innerHTML += `> ❌ ERROR: ${err.message}\n`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<span>🚀 Run Workflow Now</span>`;
  }
}
// Importance Badge Helper function
function getImportanceBadge(summary) {
  const score = summary?.importanceScore || 3;

  switch (score) {
    case 5:
      return {
        stars: "★★★★★",
        text: "Must Read",
        color: "#ef4444"
      };

    case 4:
      return {
        stars: "★★★★☆",
        text: "Important",
        color: "#f97316"
      };

    case 3:
      return {
        stars: "★★★☆☆",
        text: "Moderate",
        color: "#eab308"
      };

    case 2:
      return {
        stars: "★★☆☆☆",
        text: "Optional",
        color: "#3b82f6"
      };

    default:
      return {
        stars: "★☆☆☆☆",
        text: "Skip",
        color: "#6b7280"
      };
  }
}

// Render Articles Grid
function renderArticles(articles) {
  const container = document.getElementById('articles-container');
  if (!container) return;

  if (!articles || articles.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No articles found in lookback window.</div>`;
    return;
  }

  container.innerHTML = articles.map(art => {
    const summary = art.summary || {};
    const topicClass = getTopicBadgeClass(summary.topic);
    const importance = getImportanceBadge(summary);
    
    return `
      <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: 14px; padding: 1.2rem; display: flex; flex-direction: column; justify-space-between;">
        <div>
          <div style="margin-bottom: 0.7rem; display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
          <span
          style="
          background:${importance.color}20;
          color:${importance.color};
          border:1px solid ${importance.color};
          padding:4px 10px;
          border-radius:20px;
          font-size:0.72rem;
          font-weight:700;
          ">
          ${importance.stars} ${importance.text}
          </span>
          <span class="badge-tag ${topicClass}">
          ${escapeHtml(summary.topic || 'General')}
          </span>
          <span
          style="
            color: var(--text-muted);
            font-size:0.75rem;
            font-weight:600;
          ">
          ${escapeHtml(summary.gsPaper || '')}
          </span>
          </div>
          <h4 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem; line-height: 1.4; color: #fff;">
            ${escapeHtml(art.title)}
          </h4>
          <p style="font-size: 0.825rem; color: var(--text-muted); margin-bottom: 0.8rem; line-height: 1.5;">
            ${escapeHtml(summary.context || art.snippet.slice(0, 140) + '...')}
          </p>
        </div>
        <div style="border-top: 1px solid var(--border-color); pt: 0.8rem; margin-top: 0.8rem; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.75rem; color: var(--accent-blue);">📰 ${escapeHtml(art.sourceName)}</span>
          <a href="${escapeHtml(art.link)}" target="_blank" style="color: var(--accent-indigo); text-decoration: none; font-size: 0.8rem; font-weight: 500;">Read Source ➔</a>
        </div>
      </div>
    `;
  }).join('');
}

// Telegram Live Preview
async function loadTelegramPreview() {
  const bubble = document.getElementById('tg-bubble-content');
  const nav = document.getElementById('tg-parts-nav');
  bubble.innerHTML = 'Loading formatted message...';

  try {
    const res = await fetch('/api/telegram-preview', { method: 'POST' });
    const data = await res.json();
    currentTelegramParts = data.messages || [];
    currentPartIdx = 0;

    if (currentTelegramParts.length === 0) {
      bubble.innerHTML = '<i>No digest articles currently available to preview.</i>';
      nav.innerHTML = '';
      return;
    }

    nav.innerHTML = currentTelegramParts.map((_, i) => `
      <button class="btn btn-sm ${i === 0 ? '' : 'btn-secondary'}" onclick="showTgPart(${i})">Part ${i + 1}</button>
    `).join('');

    showTgPart(0);
  } catch (err) {
    bubble.innerHTML = `Error: ${err.message}`;
  }
}

function showTgPart(idx) {
  currentPartIdx = idx;
  const bubble = document.getElementById('tg-bubble-content');
  bubble.innerHTML = currentTelegramParts[idx] || '';

  const btns = document.querySelectorAll('#tg-parts-nav button');
  btns.forEach((btn, i) => {
    if (i === idx) {
      btn.className = 'btn btn-sm';
    } else {
      btn.className = 'btn btn-sm btn-secondary';
    }
  });
}

// Load History Records
async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const logs = await res.json();
    
    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;

    if (logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No history records yet. Run the workflow to view logs!</td></tr>`;
      return;
    }

    tbody.innerHTML = logs.map(row => `
      <tr>
        <td style="color: var(--text-muted); font-size: 0.8rem;">${row.date}</td>
        <td style="font-weight: 500;">
          <a href="${escapeHtml(row.url)}" target="_blank" style="color: #fff; text-decoration: none;">${escapeHtml(row.title)}</a>
        </td>
        <td style="color: var(--accent-blue); font-size: 0.8rem;">${escapeHtml(row.source)}</td>
        <td><span class="badge-tag ${getTopicBadgeClass(row.topic)}">${escapeHtml(row.topic)}</span></td>
        <td style="color: var(--text-muted); font-size: 0.8rem;">${escapeHtml(row.gsPaper)}</td>
        <td style="color: ${row.telegramDelivered === 'Sent' ? 'var(--accent-emerald)' : 'var(--accent-amber)'}; font-weight: 600; font-size: 0.8rem;">
          ${row.telegramDelivered}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Failed to load history:', err);
  }
}

// Save Settings Form
async function saveConfig(e) {
  e.preventDefault();
  const payload = {
    telegramBotToken: document.getElementById('cfg-telegram-token').value,
    telegramChatId: document.getElementById('cfg-telegram-chat').value,
    geminiApiKey: document.getElementById('cfg-gemini-key').value,
    googleSheetId: document.getElementById('cfg-sheet-id').value,
    cronSchedule: document.getElementById('cfg-cron-schedule').value
  };

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    alert('Settings saved successfully!');
    loadStatus();
  } catch (err) {
    alert(`Failed to save settings: ${err.message}`);
  }
}

function getTopicBadgeClass(topic = '') {
  if (topic.includes('Polity')) return 'bg-polity';
  if (topic.includes('Economy')) return 'bg-economy';
  if (topic.includes('International')) return 'bg-ir';
  if (topic.includes('Environment')) return 'bg-env';
  if (topic.includes('Science')) return 'bg-st';
  return 'bg-polity';
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[m]);
}
