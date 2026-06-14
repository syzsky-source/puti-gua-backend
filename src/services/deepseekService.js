const env = require('../config/env');

function buildMessages(systemPrompt, messages = []) {
  const result = [];
  if (systemPrompt) result.push({ role: 'system', content: String(systemPrompt) });
  for (const m of Array.isArray(messages) ? messages : []) {
    if (!m || !m.role || typeof m.content !== 'string') continue;
    if (!['system', 'user', 'assistant'].includes(m.role)) continue;
    result.push({ role: m.role, content: m.content });
  }
  return result;
}

async function openDeepSeekStream({ systemPrompt, messages, maxTokens, temperature }) {
  if (!env.deepseek.apiKey) {
    const err = new Error('后端未配置 DEEPSEEK_API_KEY');
    err.status = 401;
    throw err;
  }

  const payload = {
    model: env.deepseek.model,
    messages: buildMessages(systemPrompt, messages),
    stream: true,
    max_tokens: Number(maxTokens || 1500),
    temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.8
  };

  const resp = await fetch(`${env.deepseek.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.deepseek.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`DeepSeek 调用失败：HTTP ${resp.status} ${text}`.slice(0, 500));
    err.status = resp.status;
    throw err;
  }

  return resp;
}

module.exports = { openDeepSeekStream };
