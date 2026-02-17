/**
 * Parse uploaded CSV/Excel and compute KPIs and chart data.
 */
import XLSX from 'xlsx';
import fs from 'fs';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function inferColumns(headers) {
  const h = headers.map((x) => String(x).toLowerCase().trim());
  let dateCol = h.findIndex((x) => /date|month|year|day/.test(x));
  if (dateCol === -1) dateCol = 0;
  let valueCol = h.findIndex((x) => /sales|amount|revenue|value|total/.test(x));
  if (valueCol === -1) valueCol = h.findIndex((x) => /^\d+$/.test(x) || x === '');
  if (valueCol === -1) valueCol = 1;
  let quantityCol = h.findIndex((x) => /qty|quantity|units|volume|count/.test(x));
  if (quantityCol === -1) quantityCol = -1;
  let priceCol = h.findIndex((x) => /price|unit_price|rate|rate_per/.test(x));
  if (priceCol === -1) priceCol = -1;
  let productCol = h.findIndex((x) => /product|item|sku|category|name/.test(x));
  if (productCol === -1) productCol = Math.min(2, h.length - 1);
  let regionCol = h.findIndex((x) => /region|city|location|area|state|store/.test(x));
  if (regionCol === -1) regionCol = Math.min(3, h.length - 1);
  let paymentCol = h.findIndex((x) => /payment|pay_mode|mode|type|method|upi|card|cash/.test(x));
  if (paymentCol === -1) paymentCol = -1;
  let profitCol = h.findIndex((x) => /profit|margin|net/.test(x));
  if (profitCol === -1) profitCol = -1;
  let costCol = h.findIndex((x) => /cost|cogs|purchase/.test(x));
  if (costCol === -1) costCol = -1;
  return { dateCol, valueCol, quantityCol, priceCol, productCol, regionCol, paymentCol, profitCol, costCol, headers: h };
}

function parseValue(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

function getMonthKey(dateVal) {
  if (dateVal == null || dateVal === '') return null;
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function getDateStr(dateVal) {
  if (dateVal == null || dateVal === '') return null;
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekKey(dateVal) {
  if (dateVal == null || dateVal === '') return null;
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (Number.isNaN(d.getTime())) return null;
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, '0');
  const day = String(start.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseAndAnalyze(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('File not found');
  }
  const workbook = XLSX.readFile(filePath, { type: 'file', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows.length) {
    return {
      columns: [],
      analysis: {
        kpis: {
          total_sales: 0,
          total_quantity_sold: 0,
          total_profit: 0,
          avg_profit_margin: null,
          total_invoice_count: 0,
          avg_monthly_growth_pct: 0,
          top_product: '—',
          top_region: '—'
        },
        sales_trend: [],
        product_breakdown: [],
        region_breakdown: [],
        payment_breakdown: []
      }
    };
  }
  const headers = rows[0];
  const { dateCol, valueCol, quantityCol, priceCol, productCol, regionCol, paymentCol, profitCol, costCol } = inferColumns(headers);
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c !== '' && c != null));

  const byMonth = {};
  const byDate = {};
  const byWeek = {};
  const byProduct = {};
  const byRegion = {};
  const byPayment = {};
  const productVolume = {};
  const raw_rows = [];
  const priceQuantityPoints = [];
  const MAX_RAW_ROWS = 15000;
  let total = 0;
  let totalQuantity = 0;
  let totalProfit = 0;

  for (const row of dataRows) {
    const val = parseValue(row[valueCol]);
    if (val <= 0) continue;
    const qty = quantityCol >= 0 ? parseValue(row[quantityCol]) : null;
    const price = priceCol >= 0 ? parseValue(row[priceCol]) : (qty > 0 ? val / qty : null);
    let profit = null;
    if (profitCol >= 0 && row[profitCol] != null && row[profitCol] !== '') {
      profit = parseValue(row[profitCol]);
    } else if (costCol >= 0 && row[costCol] != null && row[costCol] !== '') {
      const cost = parseValue(row[costCol]);
      profit = val - cost;
    }
    if (profit != null && !Number.isNaN(profit)) totalProfit += profit;
    if (qty > 0) totalQuantity += qty;
    total += val;
    const monthKey = getMonthKey(row[dateCol]);
    const dateStr = getDateStr(row[dateCol]) || (monthKey ? monthKey + '-01' : null);
    const weekKey = getWeekKey(row[dateCol]);
    if (monthKey) byMonth[monthKey] = (byMonth[monthKey] || 0) + val;
    if (dateStr) byDate[dateStr] = (byDate[dateStr] || 0) + val;
    if (weekKey) byWeek[weekKey] = (byWeek[weekKey] || 0) + val;
    const product = String(row[productCol] ?? 'Other').trim() || 'Other';
    byProduct[product] = (byProduct[product] || 0) + val;
    const vol = qty > 0 ? qty : val;
    productVolume[product] = (productVolume[product] || 0) + vol;
    const region = String(row[regionCol] ?? 'Other').trim() || 'Other';
    byRegion[region] = (byRegion[region] || 0) + val;
    if (paymentCol >= 0 && row[paymentCol] != null && row[paymentCol] !== '') {
      const paymentMode = String(row[paymentCol]).trim();
      byPayment[paymentMode] = (byPayment[paymentMode] || 0) + val;
    }
    if (raw_rows.length < MAX_RAW_ROWS && monthKey) {
      raw_rows.push({
        monthKey,
        date: dateStr,
        weekKey: weekKey || null,
        product,
        region,
        value: Math.round(val),
        quantity: qty > 0 ? Math.round(qty) : null,
        price: price > 0 ? Math.round(price * 100) / 100 : null,
        profit: profit != null && !Number.isNaN(profit) ? Math.round(profit) : null,
        payment_mode: paymentCol >= 0 && row[paymentCol] != null && row[paymentCol] !== '' ? String(row[paymentCol]).trim() : null
      });
    }
    if (price > 0 && (qty > 0 || val > 0)) {
      priceQuantityPoints.push({ price: Math.round(price * 100) / 100, quantity: qty > 0 ? qty : Math.round(val / price) });
    }
  }

  // Aggregate by price bucket: mean price, total quantity sold, sum of invoice count
  const byPrice = new Map();
  for (const p of priceQuantityPoints) {
    const key = Number(p.price.toFixed(2));
    const prev = byPrice.get(key) || { priceSum: 0, quantitySum: 0, count: 0 };
    prev.priceSum += p.price;
    prev.quantitySum += (p.quantity || 0);
    prev.count += 1;
    byPrice.set(key, prev);
  }
  const price_vs_quantity = Array.from(byPrice.entries())
    .map(([priceKey, v]) => ({
      price: Math.round((v.priceSum / v.count) * 100) / 100,
      quantity: Math.round(v.quantitySum),
      count: v.count
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 500);

  const monthKeys = Object.keys(byMonth).sort();
  const sales_trend = monthKeys.map((k) => ({ month: getMonthLabel(k), monthKey: k, value: Math.round(byMonth[k]) }));

  const dateKeys = Object.keys(byDate).sort();
  const daily_sales_trend = dateKeys.map((d) => ({
    date: d,
    dateLabel: d,
    value: Math.round(byDate[d])
  }));

  const weekKeys = Object.keys(byWeek).sort();
  let cumulative = 0;
  const cumulative_and_wow = weekKeys.map((wk, i) => {
    const weekVal = byWeek[wk];
    cumulative += weekVal;
    const prevVal = i > 0 ? byWeek[weekKeys[i - 1]] : 0;
    const wow_pct = prevVal > 0 ? Math.round(((weekVal - prevVal) / prevVal) * 1000) / 10 : 0;
    return {
      weekKey: wk,
      weekLabel: wk,
      value: Math.round(weekVal),
      cumulative_sales: Math.round(cumulative),
      wow_pct
    };
  });

  const product_breakdown = Object.entries(byProduct)
    .map(([product, value]) => ({ product, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);

  const top10_products_by_volume = Object.entries(productVolume)
    .map(([product, volume]) => ({ product, volume: Math.round(volume), value: Math.round(byProduct[product] || 0) }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10);

  const region_breakdown = Object.entries(byRegion)
    .map(([region, value]) => ({ region, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);

  const payment_breakdown = Object.keys(byPayment).length
    ? Object.entries(byPayment)
        .map(([payment_mode, value]) => ({ payment_mode, value: Math.round(value) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)
    : [];

  let avg_monthly_growth_pct = 0;
  if (sales_trend.length >= 2) {
    const first = sales_trend[0].value;
    const last = sales_trend[sales_trend.length - 1].value;
    if (first > 0) avg_monthly_growth_pct = Math.round(((last - first) / first) * 100 * 10) / 10;
  }

  const top_product = product_breakdown[0]?.product || '—';
  const top_region = region_breakdown[0]?.region || '—';
  const total_invoice_count = raw_rows.length;
  const avg_profit_margin = total > 0 && (totalProfit != null) ? Math.round((totalProfit / total) * 1000) / 10 : null;

  return {
    columns: headers,
    analysis: {
      kpis: {
        total_sales: Math.round(total),
        total_quantity_sold: Math.round(totalQuantity),
        total_profit: Math.round(totalProfit),
        avg_profit_margin: avg_profit_margin != null ? avg_profit_margin : null,
        total_invoice_count,
        avg_monthly_growth_pct,
        top_product,
        top_region
      },
      sales_trend,
      daily_sales_trend,
      cumulative_and_wow,
      product_breakdown,
      region_breakdown,
      payment_breakdown,
      top10_products_by_volume,
      price_vs_quantity,
      raw_rows
    }
  };
}
