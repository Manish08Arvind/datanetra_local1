/**
 * Generate MSME performance story as a flowing PDF narrative.
 * Story flow: Opening → The headline → What the numbers say → The journey → Where it comes from → What's next → Close.
 * No blank spaces; sections filled with narrative, data, and simple graphics.
 */
import PDFDocument from 'pdfkit';

const MARGIN = 50;
const PAGE_W = 612;
const PAGE_H = 792;
const CONTENT_W = PAGE_W - MARGIN * 2;
const ACCENT = '#1a5276';
const ACCENT2 = '#2874a6';
const SUCCESS = '#1e8449';
const MUTED = '#566573';
const LIGHT_BG = '#f4f6f7';
const BAR_H = 18;

function drawSectionBar(doc, y, color = ACCENT, height = 28) {
  doc.save();
  doc.fillColor(color).rect(0, y, PAGE_W, height).fill();
  doc.restore();
}

function drawDecorLine(doc, y, color = '#bdc3c7') {
  doc.save();
  doc.strokeColor(color).lineWidth(1).moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke();
  doc.restore();
}

function drawSimpleBars(doc, data, startY, maxVal, barColor = ACCENT2, labelKey = 'month', valueKey = 'value') {
  const barW = CONTENT_W - 120;
  let y = startY;
  data.slice(0, 10).forEach((d) => {
    const label = String(d[labelKey] || '').slice(0, 14);
    const val = Number(d[valueKey]) || 0;
    const pct = maxVal > 0 ? val / maxVal : 0;
    doc.fontSize(10).fillColor(MUTED).text(label, MARGIN, y, { width: 100 });
    doc.save();
    doc.fillColor(barColor).rect(MARGIN + 105, y - 4, barW * Math.min(pct, 1), 14).fill();
    doc.restore();
    doc.fillColor('#2c3e50').text(Number(val).toLocaleString('en-IN'), MARGIN + 110 + barW, y, { width: 80 });
    y += 22;
  });
  return y;
}

export function generateStoryFlowPdf(summary, forecast, companyName = 'Your MSME') {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: MARGIN, bufferPages: true });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    function checkPageBreak(needed) {
      if (y + needed > PAGE_H - 80) {
        doc.addPage();
        y = MARGIN;
      }
    }

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
    const growth = kpis.avg_monthly_growth_pct ?? 0;

    let y = 0;

    // —— Cover ——
    drawSectionBar(doc, 0, ACCENT, 140);
    doc.fillColor('white').fontSize(22).text('Your numbers. Your story.', MARGIN, 45, { width: CONTENT_W });
    doc.fontSize(36).text(companyName, MARGIN, 95, { width: CONTENT_W });
    doc.fontSize(12).fillColor('#ecf0f1').text('Performance story · DataNetra MSME Hub', MARGIN, 155, { width: CONTENT_W });
    doc.fillColor(MUTED).fontSize(11).text(new Date().toLocaleDateString('en-IN', { dateStyle: 'long' }), MARGIN, 185, { width: CONTENT_W });
    y = 220;
    drawDecorLine(doc, y);
    y += 30;

    // —— 1. The headline ——
    doc.fillColor(ACCENT).fontSize(18).text('1. The headline', MARGIN, y);
    y += 32;
    doc.fillColor(SUCCESS).fontSize(36).text('₹' + (totalSales / 100000).toFixed(1) + ' Lakh+ total sales', MARGIN, y);
    y += 42;
    doc.fillColor('#2c3e50').fontSize(12).text(
      'This is the number that opens doors. Your data tells a clear story—use it to pitch with confidence.',
      MARGIN, y, { width: CONTENT_W, lineGap: 4 }
    );
    y += 52;
    doc.rect(MARGIN, y, CONTENT_W, 36).fill(LIGHT_BG);
    doc.fillColor(ACCENT2).fontSize(11).text(
      growth > 0 ? `Growth is at ${growth}% per month — momentum is on your side.` : 'Your next move is in the numbers.',
      MARGIN + 12, y + 10, { width: CONTENT_W - 24 }
    );
    y += 55;
    drawDecorLine(doc, y);
    y += 28;

    // —— 2. What the numbers say ——
    checkPageBreak(120);
    doc.fillColor(ACCENT).fontSize(18).text('2. What the numbers say', MARGIN, y);
    y += 32;
    doc.fillColor('#2c3e50').fontSize(11);
    doc.text(`Total sales · ₹${Number(totalSales).toLocaleString('en-IN')}`, MARGIN, y);
    doc.text(`Growth · ${growth}% per month`, MARGIN + 220, y);
    y += 22;
    doc.text(`Star product · ${topProduct}`, MARGIN, y);
    doc.text(`Top region · ${topRegion}`, MARGIN + 220, y);
    y += 22;
    if (totalProfit > 0 || avgMargin != null) {
      const parts = [];
      if (totalProfit > 0) parts.push(`Profit · ₹${Number(totalProfit).toLocaleString('en-IN')}`);
      if (avgMargin != null) parts.push(`Margin · ${avgMargin}%`);
      doc.fillColor(SUCCESS).text(parts.join('  ·  '), MARGIN, y);
      y += 22;
    }
    y += 20;
    doc.rect(MARGIN, y, CONTENT_W, 28).fill(LIGHT_BG);
    doc.fillColor(MUTED).fontSize(10).text(`"${topProduct}" is your revenue champion. ${topRegion} is where you win.`, MARGIN + 12, y + 8, { width: CONTENT_W - 24 });
    y += 45;
    drawDecorLine(doc, y);
    y += 28;

    // —— 3. The journey (trend) ——
    if (salesTrend.length > 0) {
      checkPageBreak(200);
      doc.fillColor(ACCENT).fontSize(18).text('3. The journey — month on month', MARGIN, y);
      y += 30;
      doc.fillColor(MUTED).fontSize(10).text('Sales trend that tells the story.', MARGIN, y);
      y += 22;
      const maxVal = Math.max(...salesTrend.map((d) => Number(d.value)));
      y = drawSimpleBars(doc, salesTrend, y, maxVal, ACCENT2, 'month', 'value');
      y += 25;
      drawDecorLine(doc, y);
      y += 28;
    }

    // —— 4. Where it comes from (product mix) ——
    if (productBreakdown.length > 0) {
      checkPageBreak(220);
      doc.fillColor(ACCENT).fontSize(18).text('4. Where your revenue comes from', MARGIN, y);
      y += 30;
      doc.fillColor(MUTED).fontSize(10).text('Product mix that powers your growth.', MARGIN, y);
      y += 22;
      const totalP = productBreakdown.reduce((s, d) => s + Number(d.value || 0), 0) || 1;
      productBreakdown.slice(0, 8).forEach((d) => {
        const pct = ((Number(d.value) / totalP) * 100).toFixed(1);
        doc.fillColor('#2c3e50').fontSize(10).text(String(d.product).slice(0, 28), MARGIN, y, { width: 200 });
        doc.fillColor(ACCENT2).text(`₹${Number(d.value).toLocaleString('en-IN')} (${pct}%)`, MARGIN + 210, y, { width: 150 });
        y += 20;
      });
      y += 20;
      drawDecorLine(doc, y);
      y += 28;
    }

    // —— 5. What's next (forecast) ——
    if (forecastData.length > 0) {
      checkPageBreak(200);
      doc.fillColor(ACCENT).fontSize(18).text('5. What\'s next — your demand forecast', MARGIN, y);
      y += 30;
      doc.fillColor(MUTED).fontSize(10).text('A glimpse of the road ahead.', MARGIN, y);
      y += 22;
      const maxF = Math.max(...forecastData.map((d) => Number(d.value)));
      y = drawSimpleBars(doc, forecastData, y, maxF, SUCCESS, 'date', 'value');
      y += 25;
      drawDecorLine(doc, y);
      y += 28;
    }

    // —— 6. Close ——
    if (y > PAGE_H - 120) {
      doc.addPage();
      y = MARGIN;
    }
    doc.fillColor(ACCENT).fontSize(18).text('6. The takeaway', MARGIN, y);
    y += 32;
    doc.rect(MARGIN, y, CONTENT_W, 50).fill(ACCENT);
    doc.fillColor('white').fontSize(14).text(`"${topProduct}" drives your numbers. ${topRegion} is your strongest market.`, MARGIN + 15, y + 15, { width: CONTENT_W - 30 });
    y += 65;
    doc.fillColor('#2c3e50').fontSize(11).text('Pitch with confidence. Back it with data. Use this story to build trust and close the deal.', MARGIN, y, { width: CONTENT_W, lineGap: 4 });
    y += 45;
    drawSectionBar(doc, y, ACCENT, 50);
    doc.fillColor('white').fontSize(16).text('Thank you', MARGIN, y + 14, { width: CONTENT_W });
    doc.fontSize(10).fillColor('#bdc3c7').text('DataNetra MSME Hub — Your data, your story.', MARGIN, y + 38, { width: CONTENT_W });
    doc.end();
  });
}
