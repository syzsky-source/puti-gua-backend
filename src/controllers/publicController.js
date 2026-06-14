const path = require('path');
const { query, getOne } = require('../config/db');
const env = require('../config/env');
const { ok, fail } = require('../utils/response');
const { makeId } = require('../utils/ids');
const { getOrCreateUser, decrementUserPoint } = require('../services/userService');
const { openDeepSeekStream } = require('../services/deepseekService');

async function getSettings(req, res, next) {
  try {
    const rows = await query('SELECT setting_key, setting_value FROM settings');
    const data = {};
    for (const row of rows) data[row.setting_key] = row.setting_value;
    return ok(res, data);
  } catch (err) { next(err); }
}

async function getProducts(req, res, next) {
  try {
    const rows = await query(
      `SELECT id, name, emoji, price, points_count, description
       FROM products
       WHERE is_active = 1
       ORDER BY sort_order ASC, price ASC`
    );
    return ok(res, rows);
  } catch (err) { next(err); }
}

async function getActiveQrCode(req, res, next) {
  try {
    const row = await getOne(
      `SELECT id, name, account_name, image_url, remark
       FROM qrcodes
       WHERE is_active = 1
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`
    );
    return ok(res, row);
  } catch (err) { next(err); }
}

async function getUser(req, res, next) {
  try {
    const user = await getOrCreateUser(req.params.userId);
    return ok(res, {
      id: user.id,
      points_balance: user.points_balance,
      created_at: user.created_at,
      updated_at: user.updated_at
    });
  } catch (err) { next(err); }
}

async function createOrder(req, res, next) {
  try {
    const userId = req.body.user_id;
    const productId = req.body.product_id;
    if (!userId || !productId) return fail(res, 400, 'user_id 和 product_id 必填', 400);

    await getOrCreateUser(userId);
    const product = await getOne('SELECT * FROM products WHERE id = ? AND is_active = 1', [productId]);
    if (!product) return fail(res, 404, '商品不存在或已下架', 404);

    const id = makeId('order');
    await query(
      `INSERT INTO orders
       (id, user_id, product_id, amount, points_count, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
      [id, userId, product.id, product.price, product.points_count]
    );

    const order = await getOne('SELECT * FROM orders WHERE id = ?', [id]);
    return ok(res, {
      id: order.id,
      user_id: order.user_id,
      product_id: order.product_id,
      amount: order.amount,
      points_count: order.points_count,
      status: order.status,
      created_at: order.created_at
    });
  } catch (err) { next(err); }
}

async function uploadOrderProof(req, res, next) {
  try {
    const orderId = req.params.orderId;
    const order = await getOne('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (!order) return fail(res, 404, '订单不存在', 404);
    if (!req.file) return fail(res, 400, '请上传支付截图，字段名为 image', 400);

    const relative = `/uploads/payment_proofs/${path.basename(req.file.filename)}`;
    const imageUrl = `${env.publicBaseUrl}${relative}`;

    await query(
      `UPDATE orders
       SET proof_image_url = ?, status = CASE WHEN status = 'pending' THEN 'proof_uploaded' ELSE status END, updated_at = NOW()
       WHERE id = ?`,
      [imageUrl, orderId]
    );

    return ok(res, { id: orderId, proof_image_url: imageUrl, status: 'proof_uploaded' });
  } catch (err) { next(err); }
}

function extractDeltaFromSseText(text) {
  let full = '';
  const lines = text.split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (!data || data === '[DONE]') continue;
    try {
      const parsed = JSON.parse(data);
      const delta = parsed.choices?.[0]?.delta?.content;
      if (delta) full += delta;
    } catch (_) {}
  }
  return full;
}

async function aiChat(req, res, next) {
  const userId = req.body.user_id;
  const systemPrompt = req.body.system_prompt || '';
  const messages = Array.isArray(req.body.messages) ? req.body.messages : [];
  const maxTokens = req.body.max_tokens || 1500;
  const temperature = req.body.temperature ?? 0.8;

  try {
    if (!userId) return fail(res, 400, 'user_id 必填', 400);
    const user = await getOrCreateUser(userId);
    if (Number(user.points_balance || 0) <= 0) {
      return fail(res, 402, '剩余次数不足，请先充值', 402);
    }

    const upstream = await openDeepSeekStream({ systemPrompt, messages, maxTokens, temperature });

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let rawPreview = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunkText = decoder.decode(value, { stream: true });
      rawPreview += chunkText;
      if (rawPreview.length > 12000) rawPreview = rawPreview.slice(-12000);
      fullText += extractDeltaFromSseText(chunkText);
      res.write(chunkText);
    }

    await decrementUserPoint(userId);
    await query(
      `INSERT INTO ai_logs
       (id, user_id, system_prompt, messages_json, response_text, model, prompt_tokens, completion_tokens, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NOW())`,
      [makeId('ailog'), userId, systemPrompt, JSON.stringify(messages), fullText || rawPreview.slice(0, 5000), env.deepseek.model]
    );

    res.end();
  } catch (err) {
    if (res.headersSent) {
      const safe = (err.message || 'AI 调用中断').replace(/\n/g, ' ').slice(0, 200);
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: `\n\n⚠ ${safe}` } }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }
    return next(err);
  }
}

module.exports = {
  getSettings,
  getProducts,
  getActiveQrCode,
  getUser,
  createOrder,
  uploadOrderProof,
  aiChat
};
