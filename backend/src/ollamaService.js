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
