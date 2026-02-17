/**
 * Generate MSME performance story deck (PPTX) — animated, catchy, with attractive phrases.
 * Returns a Node Buffer.
 */
import PptxGenJS from 'pptxgenjs';

// ——— Catchy phrase banks (pick by context for an energetic, pitch-ready tone) ———
const PHRASES = {
  titleTaglines: [
    'Your numbers. Your story. Your pitch.',
    'Turn data into a winning narrative.',
    'Where numbers meet impact.',
    'Data that speaks — and sells.'
  ],
  revenueHeadlines: [
    'Revenue on fire',
    'Your top line is talking',
    'The number that opens doors',
    'Revenue that turns heads'
  ],
  growthPhrases: (pct) => {
    if (pct > 20) return ['Rocket growth — own it.', 'Soaring — keep the pedal down.', 'Momentum is yours.'];
    if (pct > 10) return ['Strong growth — strategy is working.', 'Up and to the right.', 'Trending in the right direction.'];
    if (pct > 0) return ['Steady climb — stay the course.', 'Growth in motion.', 'Building momentum.'];
    if (pct < 0) return ['Time to double down.', 'Data shows where to push.', 'Your next move is in the numbers.'];
    return ['Solid base — now amplify it.', 'Data tells your story.', 'Ready for the next chapter.'];
  },
  starProduct: (name) => [
    `"${name}" — your revenue champion.`,
    `${name} is carrying the weight. Lead with it.`,
    `The hero product: ${name}.`
  ],
  topRegion: (name) => [
    `${name} — your strongest market.`,
    `${name} is where you win. Double down.`,
    `Market leader: ${name}.`
  ],
  takeaways: [
    'Pitch with confidence. Back it with data.',
    'One deck. Clear story. Strong impression.',
    'Your data — your credibility.',
    'Numbers that build trust.'
  ],
  closing: [
    'Your data. Your story. Go close the deal.',
    'DataNetra — turn insights into impact.',
    'Ready to pitch? You’ve got the numbers.'
  ]
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function catchyPhrase(kpis) {
  const growth = kpis.avg_monthly_growth_pct || 0;
  const phrases = PHRASES.growthPhrases(growth);
  return pick(phrases);
}

export async function generateStoryDeck(summary, forecast, companyName = 'Your MSME') {
  const pptx = new PptxGenJS();

  const kpis = summary?.kpis || {};
  const charts = summary?.charts || {};
  const salesTrend = charts.sales_trend || [];
  const productBreakdown = charts.product_breakdown || [];
  const forecastData = forecast?.forecast || [];
  const totalSales = Number(kpis.total_sales || 0);
  const totalProfit = Number(kpis.total_profit || 0);
  const avgMargin = kpis.avg_profit_margin != null ? kpis.avg_profit_margin : null;
  const topProduct = kpis.top_product || 'Your lead product';
  const topRegion = kpis.top_region || 'Your top region';

  pptx.author = 'DataNetra MSME Hub';
  pptx.title = 'Performance Story Deck';
  pptx.layout = 'LAYOUT_16x9';

  const ACCENT = '1a5276';
  const ACCENT2 = '2874a6';
  const SUCCESS = '1e8449';
  const MUTED = '566573';
  const LIGHT = 'e8eef3';

  function addLeftStripe(s) {
    try {
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.15, h: 5.63, fill: { color: ACCENT }, line: { type: 'none' } });
    } catch (_) {}
  }
  function addBottomStrip(s, nextLabel = null) {
    try {
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 5.35, w: 10, h: 0.3, fill: { color: LIGHT }, line: { type: 'none' } });
      s.addText('DataNetra MSME Hub', { x: 0.5, y: 5.38, w: 6, h: 0.25, fontSize: 9, color: MUTED });
      if (nextLabel) s.addText('Next: ' + nextLabel, { x: 7, y: 5.38, w: 2.5, h: 0.25, fontSize: 9, align: 'right', color: ACCENT2 });
    } catch (_) {}
  }
  function addDecorCircles(s, y) {
    try {
      s.addShape(pptx.ShapeType.ellipse, { x: 8.8, y, w: 0.5, h: 0.5, fill: { color: LIGHT }, line: { type: 'none' } });
      s.addShape(pptx.ShapeType.ellipse, { x: 9.2, y: y + 0.3, w: 0.35, h: 0.35, fill: { color: 'd5dfe8' }, line: { type: 'none' } });
    } catch (_) {}
  }

  // ——— STORY FLOW: Opening ———
  let slide = pptx.addSlide();
  try {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 10, h: 1.2, fill: { color: ACCENT }, line: { type: 'none' }
    });
  } catch (_) {}
  slide.addText(pick(PHRASES.titleTaglines), {
    x: 0.5, y: 0.35, w: 9, h: 0.6, fontSize: 28, bold: true, align: 'center', color: 'FFFFFF'
  });
  slide.addText(companyName, {
    x: 0.5, y: 1.5, w: 9, h: 0.7, fontSize: 36, bold: true, align: 'center', color: ACCENT
  });
  slide.addText('Performance story deck · A data-driven narrative', {
    x: 0.5, y: 2.2, w: 9, h: 0.4, fontSize: 16, align: 'center', color: MUTED
  });
  slide.addText(new Date().toLocaleDateString('en-IN', { dateStyle: 'long' }), {
    x: 0.5, y: 2.7, w: 9, h: 0.35, fontSize: 12, align: 'center', color: '95a5a6'
  });
  addDecorCircles(slide, 2.9);
  addBottomStrip(slide, 'The headline');

  // ——— STORY PART 1: The headline ———
  slide = pptx.addSlide();
  addLeftStripe(slide);
  try {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.2, y: 0, w: 10, h: 0.12, fill: { color: ACCENT }, line: { type: 'none' }
    });
  } catch (_) {}
  slide.addText('Part 1 — The headline', { x: 0.5, y: 0.02, w: 9, h: 0.4, fontSize: 11, color: 'FFFFFF' });
  const revenueHeadline = pick(PHRASES.revenueHeadlines);
  slide.addText(revenueHeadline, {
    x: 0.5, y: 0.35, w: 9, h: 0.5, fontSize: 22, bold: true, color: ACCENT
  });
  slide.addText('₹' + (totalSales / 100000).toFixed(1) + ' Lakh+', {
    x: 0.5, y: 1, w: 9, h: 1.3, fontSize: 52, bold: true, align: 'center', color: SUCCESS
  });
  slide.addText('Total sales · the number that opens doors', {
    x: 0.5, y: 2.35, w: 9, h: 0.45, fontSize: 16, align: 'center', color: MUTED
  });
  try {
    slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 2.75, w: 9, h: 0.55, fill: { color: LIGHT }, line: { type: 'none' } });
  } catch (_) {}
  slide.addText(catchyPhrase(kpis), {
    x: 0.6, y: 2.85, w: 8.8, h: 0.4, fontSize: 16, align: 'center', italic: true, color: ACCENT2
  });
  addDecorCircles(slide, 3.5);
  addBottomStrip(slide, 'What the numbers say');

  // ——— STORY PART 2: What the numbers say ———
  slide = pptx.addSlide();
  addLeftStripe(slide);
  try {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.2, y: 0, w: 10, h: 0.12, fill: { color: ACCENT }, line: { type: 'none' }
    });
  } catch (_) {}
  slide.addText('Part 2 — What the numbers say', { x: 0.5, y: 0.02, w: 9, h: 0.4, fontSize: 11, color: 'FFFFFF' });
  slide.addText('The numbers that matter', {
    x: 0.5, y: 0.3, w: 9, h: 0.55, fontSize: 26, bold: true, color: ACCENT
  });
  slide.addText(`Total sales · ₹${Number(totalSales).toLocaleString('en-IN')}`, {
    x: 0.5, y: 1.05, w: 4.5, h: 0.5, fontSize: 16, color: '2c3e50'
  });
  slide.addText(`Growth · ${kpis.avg_monthly_growth_pct ?? 0}% / month`, {
    x: 5, y: 1.05, w: 4.5, h: 0.5, fontSize: 16, color: '2c3e50'
  });
  slide.addText(pick(PHRASES.starProduct(topProduct)), {
    x: 0.5, y: 1.75, w: 4.5, h: 0.6, fontSize: 15, color: MUTED
  });
  slide.addText(pick(PHRASES.topRegion(topRegion)), {
    x: 5, y: 1.75, w: 4.5, h: 0.6, fontSize: 15, color: MUTED
  });
  if (totalProfit > 0 || avgMargin != null) {
    const profitLine = totalProfit > 0 ? `Profit · ₹${Number(totalProfit).toLocaleString('en-IN')}` : '';
    const marginLine = avgMargin != null ? `Margin · ${avgMargin}%` : '';
    slide.addText([profitLine, marginLine].filter(Boolean).join('  ·  '), {
      x: 0.5, y: 2.5, w: 9, h: 0.45, fontSize: 14, color: SUCCESS
    });
  }
  try {
    slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 3.0, w: 4.2, h: 0.9, fill: { color: LIGHT }, line: { type: 'none' } });
    slide.addShape(pptx.ShapeType.rect, { x: 5, y: 3.0, w: 4.2, h: 0.9, fill: { color: LIGHT }, line: { type: 'none' } });
  } catch (_) {}
  slide.addText('Use this story to pitch with confidence. Back it with data.', {
    x: 0.6, y: 3.15, w: 4, h: 0.6, fontSize: 11, color: MUTED
  });
  slide.addText('Your data builds trust. One deck, clear narrative.', {
    x: 5.1, y: 3.15, w: 4, h: 0.6, fontSize: 11, color: MUTED
  });
  addDecorCircles(slide, 4.2);
  addBottomStrip(slide, salesTrend.length ? 'The journey' : productBreakdown.length ? 'Where revenue comes from' : 'The takeaway');

  // ——— STORY PART 3: The journey (trend) ———
  if (salesTrend.length > 0) {
    slide = pptx.addSlide();
    addLeftStripe(slide);
    try {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.2, y: 0, w: 10, h: 0.12, fill: { color: ACCENT }, line: { type: 'none' }
      });
    } catch (_) {}
    slide.addText('Part 3 — The journey', { x: 0.5, y: 0.02, w: 9, h: 0.4, fontSize: 11, color: 'FFFFFF' });
    slide.addText('Month on month — your trajectory', {
      x: 0.5, y: 0.28, w: 9, h: 0.5, fontSize: 24, bold: true, color: ACCENT
    });
    slide.addText('Sales trend that tells the story', {
      x: 0.5, y: 0.78, w: 9, h: 0.35, fontSize: 14, color: MUTED
    });
    const labels = salesTrend.map((d) => d.month);
    const values = salesTrend.map((d) => Number(d.value));
    try {
      slide.addChart(pptx.ChartType.bar, [{ name: 'Sales (₹)', labels, values }], {
        x: 0.5, y: 1.2, w: 9, h: 4.0, barDir: 'col', chartColors: [ACCENT2]
      });
    } catch (_) {
      const rows = [['Month', 'Sales (₹)'], ...salesTrend.map((d) => [d.month, Number(d.value).toLocaleString()])];
      slide.addTable(rows, { x: 0.5, y: 1.2, w: 9, colW: [2, 3], fontSize: 14 });
    }
    addBottomStrip(slide, productBreakdown.length ? 'Where revenue comes from' : 'The takeaway');
  }

  // ——— STORY PART 4: Where revenue comes from ———
  if (productBreakdown.length > 0) {
    slide = pptx.addSlide();
    addLeftStripe(slide);
    try {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.2, y: 0, w: 10, h: 0.12, fill: { color: ACCENT }, line: { type: 'none' }
      });
    } catch (_) {}
    slide.addText('Part 4 — Where your revenue comes from', { x: 0.5, y: 0.02, w: 9, h: 0.4, fontSize: 11, color: 'FFFFFF' });
    slide.addText('Product mix that powers your growth', {
      x: 0.5, y: 0.28, w: 9, h: 0.5, fontSize: 24, bold: true, color: ACCENT
    });
    slide.addText('Lead with your star product; double down on your top region.', {
      x: 0.5, y: 0.78, w: 9, h: 0.35, fontSize: 14, color: MUTED
    });
    const labels = productBreakdown.slice(0, 8).map((d) => d.product);
    const values = productBreakdown.slice(0, 8).map((d) => Number(d.value));
    try {
      slide.addChart(pptx.ChartType.pie, [{ name: 'Revenue', labels, values }], {
        x: 1, y: 1.15, w: 8, h: 4.0
      });
    } catch (_) {
      const rows = [['Product', 'Revenue (₹)'], ...productBreakdown.slice(0, 10).map((d) => [d.product, Number(d.value).toLocaleString()])];
      slide.addTable(rows, { x: 0.5, y: 1.15, w: 9, colW: [4, 3], fontSize: 14 });
    }
    addBottomStrip(slide, forecastData.length ? "What's next" : 'The takeaway');
  }

  // ——— STORY PART: What's next (forecast) ———
  if (forecastData.length > 0) {
    slide = pptx.addSlide();
    addLeftStripe(slide);
    try {
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.2, y: 0, w: 10, h: 0.12, fill: { color: ACCENT }, line: { type: 'none' }
      });
    } catch (_) {}
    slide.addText("What's next", { x: 0.5, y: 0.02, w: 9, h: 0.4, fontSize: 11, color: 'FFFFFF' });
    slide.addText('Your demand forecast', {
      x: 0.5, y: 0.28, w: 9, h: 0.5, fontSize: 24, bold: true, color: ACCENT
    });
    slide.addText('A glimpse of the road ahead — plan with confidence.', {
      x: 0.5, y: 0.78, w: 9, h: 0.35, fontSize: 14, color: MUTED
    });
    if (forecast?.model_name) {
      slide.addText(`Model: ${forecast.model_name}`, {
        x: 0.5, y: 1.15, w: 9, h: 0.35, fontSize: 11, color: '95a5a6'
      });
    }
    const labels = forecastData.map((d) => d.date);
    const values = forecastData.map((d) => Number(d.value));
    try {
      slide.addChart(pptx.ChartType.line, [{ name: 'Forecast (₹)', labels, values }], {
        x: 0.5, y: 1.55, w: 9, h: 3.6
      });
    } catch (_) {
      const rows = [['Date', 'Forecast (₹)'], ...forecastData.map((d) => [d.date, Number(d.value).toLocaleString()])];
      slide.addTable(rows, { x: 0.5, y: 1.55, w: 9, colW: [3, 3], fontSize: 14 });
    }
    addBottomStrip(slide, 'The takeaway');
  }

  // ——— STORY: The takeaway (before close) ———
  slide = pptx.addSlide();
  addLeftStripe(slide);
  try {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0.2, y: 0, w: 10, h: 0.12, fill: { color: ACCENT }, line: { type: 'none' }
    });
  } catch (_) {}
  slide.addText('The takeaway', { x: 0.5, y: 0.02, w: 9, h: 0.4, fontSize: 11, color: 'FFFFFF' });
  slide.addText('One story. Clear numbers. Strong pitch.', {
    x: 0.5, y: 0.35, w: 9, h: 0.5, fontSize: 24, bold: true, color: ACCENT
  });
  try {
    slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 1.0, w: 9, h: 0.75, fill: { color: LIGHT }, line: { type: 'none' } });
  } catch (_) {}
  slide.addText(pick(PHRASES.starProduct(topProduct)), {
    x: 0.6, y: 1.1, w: 8.8, h: 0.55, fontSize: 20, align: 'center', bold: true
  });
  slide.addText(pick(PHRASES.topRegion(topRegion)), {
    x: 0.5, y: 1.95, w: 9, h: 0.5, fontSize: 18, align: 'center', color: MUTED
  });
  try {
    slide.addShape(pptx.ShapeType.rect, { x: 0.5, y: 2.6, w: 9, h: 0.6, fill: { color: ACCENT2 }, line: { type: 'none' } });
  } catch (_) {}
  slide.addText(pick(PHRASES.takeaways), {
    x: 0.6, y: 2.7, w: 8.8, h: 0.4, fontSize: 14, align: 'center', color: 'FFFFFF'
  });
  addDecorCircles(slide, 3.4);
  addBottomStrip(slide, null);

  // ——— STORY END: Thank you ———
  slide = pptx.addSlide();
  try {
    slide.addShape(pptx.ShapeType.rect, {
      x: 0, y: 0, w: 10, h: 5.63, fill: { color: ACCENT }, line: { type: 'none' }
    });
  } catch (_) {}
  slide.addText('Thank you', {
    x: 0.5, y: 1.8, w: 9, h: 0.8, fontSize: 44, bold: true, align: 'center', color: 'FFFFFF'
  });
  slide.addText(pick(PHRASES.closing), {
    x: 0.5, y: 2.7, w: 9, h: 0.6, fontSize: 18, align: 'center', color: 'FFFFFF'
  });
  slide.addText('DataNetra MSME Hub — Your data, your story.', {
    x: 0.5, y: 3.5, w: 9, h: 0.4, fontSize: 14, align: 'center', color: 'bdc3c7'
  });
  try {
    slide.addShape(pptx.ShapeType.ellipse, { x: 4.5, y: 4.5, w: 1, h: 0.5, fill: { color: '2c3e50' }, line: { type: 'none' } });
  } catch (_) {}

  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  return Buffer.from(buffer);
}
