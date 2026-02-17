/**
 * Lightweight ML-style forecast: normalize time series, fit linear trend, denormalize.
 * Computes a simple accuracy (MAPE on last N points) for reporting.
 */

/**
 * Min-max normalize array of numbers to [0, 1]. Returns { values, min, max } for denormalization.
 */
function normalize(values) {
  if (!values.length) return { values: [], min: 0, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return {
    values: values.map((v) => (v - min) / range),
    min,
    max
  };
}

/**
 * Simple linear regression: y = mx + c. Returns { m, c }.
 */
function linearFit(xArr, yArr) {
  const n = xArr.length;
  if (n < 2) return { m: 0, c: yArr[0] ?? 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xArr[i];
    sumY += yArr[i];
    sumXY += xArr[i] * yArr[i];
    sumX2 += xArr[i] * xArr[i];
  }
  const m = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;
  const c = (sumY - m * sumX) / n;
  return { m, c };
}

/**
 * Mean Absolute Percentage Error (MAPE) for actual vs predicted. Returns a number (e.g. 0.08 = 8%).
 */
function mape(actual, predicted) {
  if (actual.length === 0 || actual.length !== predicted.length) return null;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== 0) {
      sum += Math.abs((actual[i] - predicted[i]) / actual[i]);
      count++;
    }
  }
  return count ? sum / count : null;
}

/**
 * Run forecast on weekly historical values.
 * @param {Array<{ week: string, value: number }>} weeklyHistorical
 * @param {number} horizonWeeks - number of weeks to forecast (default 4)
 * @returns { { weekly_historical, weekly_forecast, model_name, accuracy } }
 */
export function runForecast(weeklyHistorical, horizonWeeks = 4) {
  const modelName = 'Linear Trend (Normalized)';
  const values = (weeklyHistorical || []).map((d) => Number(d.value) || 0).filter((v) => v > 0);
  const labels = (weeklyHistorical || []).map((d) => d.week || d.weekLabel || d.weekKey || '');

  if (values.length < 2) {
    const lastVal = values.length ? values[0] : 100000;
    const weekly_forecast = Array.from({ length: horizonWeeks }, (_, i) => ({
      week: `W+${i + 1}`,
      value: Math.round(lastVal * Math.pow(1.02, i + 1))
    }));
    return {
      weekly_historical: (weeklyHistorical || []).slice(-12).map((w) => ({ week: w.week || w.weekLabel || w.weekKey, value: Number(w.value) || 0 })),
      weekly_forecast,
      model_name: modelName,
      accuracy: 'N/A (insufficient history)'
    };
  }

  const { values: normValues, min, max } = normalize(values);
  const n = normValues.length;
  const xArr = Array.from({ length: n }, (_, i) => i);
  const { m, c } = linearFit(xArr, normValues);

  const fitted = xArr.map((x) => m * x + c);
  const fittedDenorm = fitted.map((y) => Math.max(0, y * (max - min) + min));

  const mapeVal = mape(values, fittedDenorm);
  const accuracyPct = mapeVal != null ? Math.max(0, 100 - mapeVal * 100).toFixed(1) + '%' : 'N/A';

  const forecastX = Array.from({ length: horizonWeeks }, (_, i) => n + i);
  const forecastNorm = forecastX.map((x) => m * x + c);
  const forecastDenorm = forecastNorm.map((y) => Math.max(0, Math.round(y * (max - min) + min)));

  const weekly_forecast = forecastDenorm.map((v, i) => ({
    week: `W+${i + 1}`,
    value: v
  }));

  const weekly_historical = (weeklyHistorical || []).slice(-12).map((w) => ({
    week: w.week || w.weekLabel || w.weekKey,
    value: Number(w.value) || 0
  }));

  return {
    weekly_historical,
    weekly_forecast,
    model_name: modelName,
    accuracy: accuracyPct
  };
}
