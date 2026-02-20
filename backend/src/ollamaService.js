/**
 * Lightweight integration with Ollama for analytics Q&A.
 * Uses a small local LLM (e.g. llama3.2:3b or qwen2.5:1.5b) to answer questions
 * from the uploaded dataset analysis. Set OLLAMA_BASE_URL (e.g. http://localhost:11434)
 * and optionally OLLAMA_MODEL in .env. If Ollama is unavailable, the app falls back
 * to rule-based answers.
 */

const OLLAMA_BASE = (process.env.OLLAMA_BASE_URL || '').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2:3b';
const OLLAMA_TIMEOUT_MS = parseInt(process.env.OLLAMA_TIMEOUT_MS || '30000', 10);

export function isOllamaConfigured() {
  return Boolean(OLLAMA_BASE);
}

/**
 * Build a concise text summary of the analysis for the LLM context.
 * @param {object} analysis - dataset analysis
 * @param {string} [forecastSummary] - optional forecast text (model, accuracy, next 4 weeks)
 */
function analysisToContext(analysis, forecastSummary = '') {
  const parts = [];
  if (!analysis) {
    parts.push('No dataset has been uploaded yet.');
    if (forecastSummary) parts.push(forecastSummary);
    return parts.join('. ');
  }
  const k = analysis.kpis || {};
  if (k.total_sales != null) parts.push(`Total sales: ₹${Number(k.total_sales).toLocaleString()}`);
  if (k.avg_monthly_growth_pct != null) parts.push(`Average monthly growth: ${k.avg_monthly_growth_pct}%`);
  if (k.top_product) parts.push(`Top product: ${k.top_product}`);
  if (k.top_region) parts.push(`Top region/location: ${k.top_region}`);
  const products = analysis.product_breakdown || [];
  if (products.length) parts.push('Sales by product: ' + products.map((p) => `${p.product}: ₹${Number(p.value).toLocaleString()}`).join('; '));
  const regions = analysis.region_breakdown || [];
  if (regions.length) parts.push('Sales by store location: ' + regions.map((r) => `${r.region}: ₹${Number(r.value).toLocaleString()}`).join('; '));
  const payments = analysis.payment_breakdown || [];
  if (payments.length) parts.push('Sales by payment mode: ' + payments.map((p) => `${p.payment_mode}: ₹${Number(p.value).toLocaleString()}`).join('; '));
  const trend = analysis.sales_trend || [];
  if (trend.length) parts.push('Monthly trend: ' + trend.map((t) => `${t.month || t.monthKey}: ₹${Number(t.value).toLocaleString()}`).join(', '));
  if (forecastSummary) parts.push(forecastSummary);
  return parts.join('. ');
}

/**
 * Ask Ollama to answer the user question using the dataset analysis (and optional forecast) as context.
 * @param {object} analysis - schema_json.analysis from uploaded_datasets
 * @param {string} question - user question
 * @param {array} history - optional recent { role, content } for context
 * @param {string} [forecastSummary] - optional text about forecast (model, accuracy, next 4 weeks)
 * @returns {Promise<string|null>} - assistant reply or null if Ollama fails
 */
export async function askOllama(analysis, question, history = [], forecastSummary = '') {
  if (!OLLAMA_BASE) return null;
  const context = analysisToContext(analysis, forecastSummary);
  const historyText = history.length
    ? 'Recent conversation:\n' + history.slice(-4).map((m) => `${m.role}: ${m.content}`).join('\n') + '\n\n'
    : '';
  const system = `You are an analytics assistant. Answer ONLY from the following dataset summary. Be brief and use numbers when relevant. If the data does not contain the answer, say so. Do not make up figures.`;
  const prompt = `${system}\n\nDataset summary: ${context}\n\n${historyText}User: ${question}\n\nAssistant:`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const json = await res.json();
    const text = (json.response || '').trim();
    return text || null;
  } catch (err) {
    clearTimeout(timeoutId);
    if (process.env.NODE_ENV !== 'test') console.warn('Ollama request failed:', err.message);
    return null;
  }
}

const BUSINESS_TYPE_DESCRIPTION = {
  fmcg: 'FMCG: food, groceries, packaged goods, rice, wheat, pulses, oil, beverages, snacks, personal care, dairy. Company names: food/grocery traders, distributors.',
  clothing: 'Clothing: garments, textiles, apparel, fabric, fashion, wear. Company names: clothing, textiles, garments.',
  electronic: 'Electronic: electronics, devices, components, cables, batteries. Company names: tech, electronics, digital.',
  supermarket: 'Supermarket: retail, groceries, mart, store. Company names: retail, supermarket, provisions.'
};

/**
 * Use LLM to filter opportunity lists: keep only entries where company name AND product match business type.
 * E.g. "Fashion Agency" + "Rice" is invalid for FMCG. Returns sets of keys so we filter original rows in code.
 * @param {string} businessType - fmcg | clothing | electronic | supermarket
 * @param {array} buyFrom - [{ supplier_name, product_name, ... }]
 * @param {array} sellTo - [{ buyer_name, product_name, ... }]
 * @returns {Promise<{ buy_from: array, sell_to: array }|null>} - filtered lists (same objects as input) or null
 */
export async function filterOpportunityLists(businessType, buyFrom, sellTo) {
  if (!OLLAMA_BASE || !businessType) return null;
  const buyFromList = (buyFrom || []).map((r) => ({ supplier_name: r.supplier_name, product_name: r.product_name }));
  const sellToList = (sellTo || []).map((r) => ({ buyer_name: r.buyer_name, product_name: r.product_name }));
  if (buyFromList.length === 0 && sellToList.length === 0) return { buy_from: buyFrom || [], sell_to: sellTo || [] };

  const desc = BUSINESS_TYPE_DESCRIPTION[businessType] || businessType;
  const system = `You are a data validator. Keep only entries where BOTH the company name AND the product fit the business type. Examples of INVALID: "Fashion Agency" selling "Rice" for FMCG (Fashion = clothing). "Sai Traders" selling "Rice" for FMCG = VALID. Return JSON only.`;

  const prompt = `Business type: ${businessType}. ${desc}

Wholesalers (supplier_name, product_name) – list only valid pairs:
${JSON.stringify(buyFromList)}

Companies in need (buyer_name, product_name) – list only valid pairs:
${JSON.stringify(sellToList)}

Return JSON: {"buy_from": [{"supplier_name":"...","product_name":"..."}, ...], "sell_to": [{"buyer_name":"...","product_name":"..."}, ...]} with only the valid entries. No other text.`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: (system ? system + '\n\n' : '') + prompt,
        stream: false
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const json = await res.json();
    const text = (json.response || '').trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const validBuyKeys = new Set(
      (Array.isArray(parsed.buy_from) ? parsed.buy_from : [])
        .map((e) => `${String(e.supplier_name || '').trim()}|${String(e.product_name || '').trim()}`)
    );
    const validSellKeys = new Set(
      (Array.isArray(parsed.sell_to) ? parsed.sell_to : [])
        .map((e) => `${String(e.buyer_name || '').trim()}|${String(e.product_name || '').trim()}`)
    );
    const filteredBuy = (buyFrom || []).filter(
      (r) => validBuyKeys.has(`${String(r.supplier_name || '').trim()}|${String(r.product_name || '').trim()}`)
    );
    const filteredSell = (sellTo || []).filter(
      (r) => validSellKeys.has(`${String(r.buyer_name || '').trim()}|${String(r.product_name || '').trim()}`)
    );
    return {
      buy_from: validBuyKeys.size > 0 ? filteredBuy : buyFrom || [],
      sell_to: validSellKeys.size > 0 ? filteredSell : sellTo || []
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (process.env.NODE_ENV !== 'test') console.warn('Ollama filterOpportunityLists failed:', err.message);
    return null;
  }
}
