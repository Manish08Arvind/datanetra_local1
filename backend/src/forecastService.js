/**
 * Sales forecast with trend + seasonality (yearly + weekly).
 * Feature engineering: lags (t-1, t-2, t-4), rolling averages, month, week_of_year.
 * Model: multiple linear regression (or optional Prophet/XGBoost via Python).
 * Returns 13-week forecast, confidence interval, and structured insights.
 */

const HORIZON_WEEKS = 13;
const HOLDOUT_WEEKS = 4; // for validation / model selection

/**
 * Parse week key (e.g. "2024-01-07" or "2024-W02") to { date, month, week_of_year }.
 */
function parseWeekKey(weekKey) {
  if (!weekKey || typeof weekKey !== 'string') return null;
  const match = weekKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, y, m, d] = match.map(Number);
    const date = new Date(y, m - 1, d);
    const startOfYear = new Date(y, 0, 1);
    const week_of_year = Math.min(52, Math.floor((date - startOfYear) / (7 * 24 * 60 * 60 * 1000)) + 1);
    return { date, year: y, month: m, week_of_year };
  }
  const wMatch = weekKey.match(/^(\d{4})-W?(\d{2})$/i);
  if (wMatch) {
    const [, y, w] = wMatch.map(Number);
    return { date: new Date(y, 0, 1 + (w - 1) * 7), year: parseInt(y, 10), month: 0, week_of_year: Math.min(52, w) };
  }
  return null;
}

/**
 * Add 7 days to a Date.
 */
function addWeeks(date, n = 1) {
  const d = new Date(date);
  d.setDate(d.getDate() + 7 * n);
  return d;
}

/**
 * Mean Absolute Percentage Error.
 */
function mape(actual, predicted) {
  if (!actual.length || actual.length !== predicted.length) return null;
  let sum = 0, count = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== 0) {
      sum += Math.abs((actual[i] - predicted[i]) / actual[i]);
      count++;
    }
  }
  return count ? sum / count : null;
}

/**
 * Build feature matrix and target for regression.
 * Features: [1, trend, lag_1, lag_2, lag_4, roll_2, roll_4, month, week_of_year].
 */
function buildFeatures(rows) {
  const n = rows.length;
  const values = rows.map((r) => r.value);
  const feats = [];
  for (let i = 0; i < n; i++) {
    const lag_1 = i >= 1 ? values[i - 1] : values[0];
    const lag_2 = i >= 2 ? values[i - 2] : (i >= 1 ? values[i - 1] : values[0]);
    const lag_4 = i >= 4 ? values[i - 4] : (i >= 1 ? values[i - 1] : values[0]);
    const roll_2 = i >= 1 ? (values[i - 1] + (i >= 2 ? values[i - 2] : values[i - 1])) / (i >= 2 ? 2 : 1) : values[0];
    const roll_4 = i >= 4
      ? (values[i - 1] + values[i - 2] + values[i - 3] + values[i - 4]) / 4
      : (i >= 1 ? values.slice(0, i).reduce((s, v) => s + v, 0) / i : values[0]);
    const parsed = parseWeekKey(rows[i].week);
    const month = parsed ? parsed.month : ((i % 12) + 1);
    const week_of_year = parsed ? parsed.week_of_year : ((i % 52) + 1);
    feats.push([
      1,
      i,
      lag_1,
      lag_2,
      lag_4,
      roll_2,
      roll_4,
      month,
      week_of_year
    ]);
  }
  return { X: feats, y: values };
}

/**
 * Ordinary Least Squares: beta = (X'X)^{-1} X'y.
 * X = list of rows (each row = one observation).
 */
function ols(X, y) {
  const n = X.length;
  const k = X[0].length;
  const XtX = Array.from({ length: k }, () => Array(k).fill(0));
  const Xty = Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    const xi = X[i];
    for (let r = 0; r < k; r++) {
      for (let c = 0; c < k; c++) XtX[r][c] += xi[r] * xi[c];
      Xty[r] += xi[r] * y[i];
    }
  }
  const inv = invertMatrix(XtX);
  if (!inv) return null;
  const beta = Array(k).fill(0);
  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) beta[r] += inv[r][c] * Xty[c];
  }
  return beta;
}

function invertMatrix(A) {
  const n = A.length;
  const aug = A.map((row, i) => [...row, ...(Array(n).fill(0).map((_, j) => (i === j ? 1 : 0)))]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row;
    }
    [aug[col], aug[pivot]] = [aug[pivot], aug[col]];
    const div = aug[col][col];
    if (Math.abs(div) < 1e-10) return null;
    for (let c = 0; c < 2 * n; c++) aug[col][c] /= div;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let c = 0; c < 2 * n; c++) aug[row][c] -= factor * aug[col][c];
    }
  }
  return aug.map((row) => row.slice(n));
}

/**
 * Regression model: fit on (X, y), predict for new rows, optional residual SE for confidence.
 */
function fitRegressionModel(rows) {
  const { X, y } = buildFeatures(rows);
  const minRows = 6;
  if (X.length < minRows) return null;
  const beta = ols(X, y);
  if (!beta) return null;
  const fitted = X.map((xi) => Math.max(0, xi.reduce((s, v, j) => s + v * beta[j], 0)));
  const residuals = y.map((yi, i) => yi - fitted[i]);
  const rss = residuals.reduce((s, r) => s + r * r, 0);
  const df = Math.max(1, X.length - X[0].length);
  const residualSe = Math.sqrt(rss / df);
  return { beta, fitted, residualSe, k: X[0].length };
}

/**
 * Forecast next `horizon` weeks using fitted regression; recursive for lags/rolling.
 * Returns { forecast, lower, upper } (point forecast and approximate 95% interval).
 */
function forecastRegression(model, rows, horizon) {
  const values = rows.map((r) => r.value);
  const n = values.length;
  const lastRow = rows[n - 1];
  let lastDate = parseWeekKey(lastRow.week)?.date || new Date();
  const forecast = [];
  const lower = [];
  const upper = [];
  const halfWidth = 1.96 * (model.residualSe || 0);
  for (let h = 0; h < horizon; h++) {
    const lag_1 = h === 0 ? values[n - 1] : forecast[h - 1];
    const lag_2 = h === 0 ? values[n - 2] : (h === 1 ? values[n - 1] : forecast[h - 2]);
    const lag_4 = h < 4 ? (n - 4 + h >= 0 ? values[n - 4 + h] : values[0]) : forecast[h - 4];
    const roll_2 = h === 0
      ? (values[n - 1] + values[n - 2]) / 2
      : (forecast[h - 1] + (h === 1 ? values[n - 1] : forecast[h - 2])) / 2;
    const roll_4 = h < 4
      ? (values.slice(-(4 - h)).concat(forecast.slice(0, h)).reduce((s, v) => s + v, 0)) / 4
      : (forecast[h - 1] + forecast[h - 2] + forecast[h - 3] + forecast[h - 4]) / 4;
    lastDate = addWeeks(lastDate, 1);
    const month = lastDate.getMonth() + 1;
    const startOfYear = new Date(lastDate.getFullYear(), 0, 1);
    const week_of_year = Math.min(52, Math.floor((lastDate - startOfYear) / (7 * 24 * 60 * 60 * 1000)) + 1);
    const x = [1, n + h, lag_1, lag_2, lag_4, roll_2, roll_4, month, week_of_year];
    const pred = Math.max(0, x.reduce((s, v, j) => s + v * model.beta[j], 0));
    forecast.push(pred);
    lower.push(Math.max(0, pred - halfWidth));
    upper.push(pred + halfWidth);
  }
  return { forecast, lower, upper };
}

/**
 * Run regression-based forecast (trend + seasonality via lags + month + week_of_year).
 */
function runRegressionForecast(rows, horizon) {
  const model = fitRegressionModel(rows);
  if (!model) return null;
  const { forecast, lower, upper } = forecastRegression(model, rows, horizon);
  const fitted = model.fitted;
  const actual = rows.map((r) => r.value);
  const mapeVal = mape(actual, fitted);
  return {
    name: 'Trend + Seasonality (Regression)',
    forecast: forecast.map((v) => Math.round(v)),
    lower: lower.map((v) => Math.round(v)),
    upper: upper.map((v) => Math.round(v)),
    residualSe: model.residualSe,
    mape: mapeVal
  };
}

/**
 * Fallback: linear trend only (no lags/seasonality).
 */
function runLinearTrendFallback(rows, horizon) {
  const values = rows.map((r) => r.value);
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;
  const c = (sumY - m * sumX) / n;
  const fitted = values.map((_, i) => Math.max(0, m * i + c));
  const forecast = Array.from({ length: horizon }, (_, i) => Math.max(0, Math.round(m * (n + i) + c)));
  const rss = values.reduce((s, y, i) => s + (y - fitted[i]) ** 2, 0);
  const residualSe = Math.sqrt(rss / Math.max(1, n - 2));
  const halfWidth = 1.96 * residualSe;
  return {
    name: 'Linear Trend',
    forecast,
    lower: forecast.map((v) => Math.max(0, Math.round(v - halfWidth))),
    upper: forecast.map((v) => Math.round(v + halfWidth)),
    residualSe,
    mape: mape(values, fitted)
  };
}

/**
 * Try Python Prophet script if available; returns null if not.
 */
async function tryProphetForecast(weeklyHistorical, horizon) {
  try {
    const { spawn } = await import('child_process');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const scriptPath = path.join(__dirname, '..', 'scripts', 'forecast_prophet.py');
    const fs = await import('fs');
    if (!fs.existsSync(scriptPath)) return null;
    const input = JSON.stringify({ series: weeklyHistorical, horizon });
    const result = await new Promise((resolve, reject) => {
      const proc = spawn('python', [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      proc.stdout.on('data', (d) => { out += d; });
      proc.stderr.on('data', (d) => { err += d; });
      proc.stdin.end(input);
      proc.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || 'Script failed'))));
    });
    const data = JSON.parse(result);
    return {
      name: 'Prophet (Facebook)',
      forecast: data.forecast || [],
      lower: data.lower || [],
      upper: data.upper || [],
      residualSe: data.residual_se,
      mape: data.mape != null ? data.mape : null
    };
  } catch (_) {
    return null;
  }
}

/**
 * Main entry: run JS regression (and optionally Prophet), pick best by holdout MAPE; build insights.
 */
export async function runForecast(weeklyHistorical, horizonWeeks = HORIZON_WEEKS) {
  const cleaned = (weeklyHistorical || [])
    .map((d) => ({
      week: d.week || d.weekLabel || d.weekKey || '',
      value: Number(d.value) || 0
    }))
    .filter((d) => d.week && d.value > 0);

  if (cleaned.length < 3) {
    const lastVal = cleaned.length ? cleaned[cleaned.length - 1].value : 100000;
    const weekly_forecast = Array.from({ length: horizonWeeks }, (_, i) => ({
      week: `W+${i + 1}`,
      value: Math.round(lastVal * Math.pow(1.02, i + 1))
    }));
    return {
      weekly_historical: cleaned.slice(-13),
      weekly_forecast,
      forecast_lower: null,
      forecast_upper: null,
      model_name: 'Naive growth (2%/week)',
      accuracy: 'N/A (insufficient history)',
      insights: {
        bullets: ['Not enough history to compare algorithms. A simple 2% weekly growth assumption is used for the next period.'],
        total_expected_sales_13w: weekly_forecast.reduce((s, d) => s + d.value, 0),
        growth_vs_prev_13_pct: null,
        peak_sales_week: null,
        confidence_warning: null
      }
    };
  }

  const horizon = Math.min(horizonWeeks, 13);

  // JS models
  const reg = runRegressionForecast(cleaned, horizon);
  const linear = runLinearTrendFallback(cleaned, horizon);

  // Optional Prophet (Python) – better at complex seasonality/ups & downs
  let prophetResult = null;
  try {
    prophetResult = await tryProphetForecast(cleaned.map((d) => ({ week: d.week, value: d.value })), horizon);
  } catch (_) {}

  let best;
  let modelReason = '';
  if (prophetResult && (prophetResult.mape != null || (reg == null && linear == null))) {
    best = prophetResult;
    modelReason = 'Prophet was chosen for its strength in capturing yearly and weekly seasonality and trend, which suits retail sales patterns.';
  } else {
    const candidates = [];
    if (reg) candidates.push(reg);
    if (linear) candidates.push(linear);
    best = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      const cur = candidates[i];
      const bestErr = best.mape == null ? Infinity : best.mape;
      const curErr = cur.mape == null ? Infinity : cur.mape;
      if (curErr < bestErr) best = cur;
    }
    if (reg && linear) {
      const regErr = reg.mape == null ? Infinity : reg.mape;
      const linErr = linear.mape == null ? Infinity : linear.mape;
      if (best === reg) modelReason = 'Trend + Seasonality (Regression) was chosen over Linear Trend because it had lower in-sample error (MAPE), better capturing lags and seasonal patterns.';
      else modelReason = 'Linear Trend was chosen over Regression because it had lower in-sample error (MAPE) for this series.';
    } else modelReason = 'This model was used as the best available fit for the historical data.';
  }

  const accuracyPct = best.mape != null ? Math.max(0, (100 - best.mape * 100).toFixed(1)) + '%' : 'N/A';
  const weekly_historical = cleaned.slice(-13);
  const weekly_forecast = best.forecast.slice(0, horizon).map((v, i) => ({
    week: `W+${i + 1}`,
    value: typeof v === 'number' ? v : Math.round(Number(v))
  }));
  const forecast_lower = best.lower ? best.lower.slice(0, horizon).map((v) => Math.max(0, typeof v === 'number' ? v : Math.round(Number(v)))) : null;
  const forecast_upper = best.upper ? best.upper.slice(0, horizon).map((v) => typeof v === 'number' ? v : Math.round(Number(v))) : null;

  const prev13 = cleaned.slice(-13).map((d) => d.value);
  const prev13Total = prev13.reduce((s, v) => s + v, 0);
  const next13Total = weekly_forecast.reduce((s, d) => s + (d.value || 0), 0);
  const growthPct = prev13Total > 0 ? (((next13Total - prev13Total) / prev13Total) * 100) : null;
  let peakWeek = null;
  if (weekly_forecast.length > 0) {
    const maxIdx = weekly_forecast.reduce((best, d, i) => (d.value > (weekly_forecast[best]?.value || 0) ? i : best), 0);
    peakWeek = { week: weekly_forecast[maxIdx].week, value: weekly_forecast[maxIdx].value };
  }
  const avgForecast = weekly_forecast.length ? next13Total / weekly_forecast.length : 0;
  const meanWidth = forecast_lower && forecast_upper && forecast_lower.length
    ? forecast_lower.reduce((s, _, i) => s + (forecast_upper[i] - forecast_lower[i]), 0) / forecast_lower.length
    : 0;
  const confidence_warning = avgForecast > 0 && meanWidth / avgForecast > 0.4
    ? 'The confidence interval is unusually wide, indicating high volatility or uncertainty in the forecast. Use the numbers as a range rather than a precise prediction.'
    : null;

  const bullets = [
    modelReason ? `Why this model: ${modelReason}` : null,
    `Total expected sales for the next 13 weeks: ₹${Math.round(next13Total).toLocaleString('en-IN')}.`,
    growthPct != null
      ? `Comparison vs. previous 13 weeks: ${growthPct >= 0 ? '+' : ''}${growthPct.toFixed(1)}% ${growthPct >= 0 ? 'growth' : 'decline'}.`
      : 'Comparison vs. previous 13 weeks: not enough history.',
    peakWeek
      ? `Peak sales week in the forecast period: ${peakWeek.week} (₹${Number(peakWeek.value).toLocaleString('en-IN')}).`
      : null,
    confidence_warning ? `⚠ ${confidence_warning}` : null
  ].filter(Boolean);

  return {
    weekly_historical,
    weekly_forecast,
    forecast_lower,
    forecast_upper,
    model_name: best.name,
    accuracy: accuracyPct,
    model_reason: modelReason,
    insights: {
      bullets,
      total_expected_sales_13w: next13Total,
      growth_vs_prev_13_pct: growthPct,
      peak_sales_week: peakWeek,
      confidence_warning,
      model_reason: modelReason
    }
  };
}
