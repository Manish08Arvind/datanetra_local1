import React, { useEffect, useState, useRef } from 'react';
import api from '../api.js';

const PAD = { left: 52, right: 28, top: 16, bottom: 44 };
const CHART_COLORS = ['#38bdf8', '#34d399', '#a78bfa', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#8b5cf6'];

function LineChart({ data, width = 400, height = 220, valueKey = 'value', labelKey = 'month', color = '#38bdf8', legendLabel = 'Sales' }) {
  const [hovered, setHovered] = useState(null);
  if (!data?.length) return null;
  const minPointWidth = 52;
  const chartWidth = Math.max(width, data.length * minPointWidth);
  const values = data.map((d) => Number(d[valueKey]) || 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const w = chartWidth - PAD.left - PAD.right;
  const h = height - PAD.top - PAD.bottom;
  const n = data.length - 1 || 1;
  const points = data.map((d, i) => {
    const x = PAD.left + (i / n) * w;
    const y = PAD.top + h - ((Number(d[valueKey]) || 0) - min) / range * h;
    return `${x},${y}`;
  }).join(' ');
  const hoverPoint = hovered != null ? (() => {
    const i = hovered;
    const x = PAD.left + (i / n) * w;
    const y = PAD.top + h - ((Number(data[i][valueKey]) || 0) - min) / range * h;
    return { x, y, label: data[i][labelKey] ?? data[i].dateLabel ?? data[i].month ?? `#${i + 1}`, value: Number(data[i][valueKey]) || 0 };
  })() : null;
  const labelStep = data.length > 18 ? Math.max(1, Math.floor(data.length / 14)) : 1;
  return (
    <div className="chart-scroll-wrap">
      <div className="chart-inner" style={{ position: 'relative', minWidth: chartWidth }}>
        {hoverPoint && (
          <div className="chart-tooltip" style={{ left: hoverPoint.x, top: hoverPoint.y - 8, transform: 'translate(-50%, -100%)' }}>
            {hoverPoint.label}: ₹{hoverPoint.value.toLocaleString()}
          </div>
        )}
        <svg width={chartWidth} height={height} viewBox={`0 0 ${chartWidth} ${height}`} preserveAspectRatio="xMinYMid meet" className="chart-svg chart-svg-line" style={{ display: 'block' }}>
          <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} shapeRendering="geometricPrecision" />
          {data.map((d, i) => {
            const x = PAD.left + (i / n) * w;
            const y = PAD.top + h - ((Number(d[valueKey]) || 0) - min) / range * h;
            return (
              <circle key={i} cx={x} cy={y} r={hovered === i ? 6 : 4} fill={color} style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
            );
          })}
          {data.map((d, i) => {
            if (i % labelStep !== 0) return null;
            const label = String(d[labelKey] ?? d.dateLabel ?? d.month ?? '').slice(0, 12);
            const x = PAD.left + (i / n) * w;
            return <text key={i} x={x} y={height - 14} textAnchor="middle" fontSize="10" fill="#94a3b8" className="chart-axis-label">{label}</text>;
          })}
        </svg>
        <div className="chart-legend">
          <span><span className="legend-swatch" style={{ background: color }} /></span>
          <span>{legendLabel}</span>
        </div>
      </div>
    </div>
  );
}

function PieChart({ data, size = 200 }) {
  const [hovered, setHovered] = useState(null);
  if (!data?.length) return null;
  const total = data.reduce((s, d) => s + (Number(d.value) || 0), 0) || 1;
  const cx = size / 2, cy = size / 2, r = size / 2 - 8;
  let acc = 0;
  const segments = data.map((d, i) => {
    const v = Number(d.value) || 0;
    const start = acc;
    acc += v / total;
    const end = acc;
    const startAngle = start * 2 * Math.PI - Math.PI / 2;
    const endAngle = end * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const large = end - start > 0.5 ? 1 : 0;
    const dPath = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    const label = d.label ?? d.product ?? d.region ?? d.payment_mode ?? `Item ${i + 1}`;
    const pct = total ? ((v / total) * 100).toFixed(1) : 0;
    return { d: dPath, color: CHART_COLORS[i % CHART_COLORS.length], label, value: v, pct };
  });
  const tip = hovered != null ? segments[hovered] : null;
  return (
    <div className="pie-chart-wrap" style={{ position: 'relative' }}>
      {tip && (
        <div className="chart-tooltip" style={{ left: cx, top: 8, transform: 'translate(-50%, 0)' }}>
          {tip.label}: ₹{tip.value.toLocaleString()} ({tip.pct}%)
        </div>
      )}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments.map((s, i) => (
          <path key={i} d={s.d} fill={s.color} stroke="#1e293b" strokeWidth="1" style={{ cursor: 'pointer', opacity: hovered != null && hovered !== i ? 0.6 : 1 }}
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
        ))}
      </svg>
      <ul className="pie-legend">
        {segments.map((s, i) => (
          <li key={i}><span className="pie-legend-swatch" style={{ background: s.color }} /><span>{s.label}</span></li>
        ))}
      </ul>
    </div>
  );
}

function ScatterChart({ data, width = 420, height = 240, xKey = 'x', yKey = 'y', xLabel = 'Price', yLabel = 'Quantity' }) {
  const [hovered, setHovered] = useState(null);
  if (!data?.length) return null;
  const pad = { left: 56, right: 24, top: 20, bottom: 48 };
  const xVals = data.map((d) => Number(d[xKey]) ?? Number(d.price) ?? 0);
  const yVals = data.map((d) => Number(d[yKey]) ?? Number(d.quantity) ?? 0);
  const maxX = Math.max(...xVals, 1);
  const maxY = Math.max(...yVals, 1);
  const minX = Math.min(...xVals, 0);
  const priceRange = maxX - minX || 1;
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const x0 = pad.left;
  const y0 = pad.top + h;
  const getColor = (price) => {
    const t = priceRange ? (Number(price) - minX) / priceRange : 0;
    const r = Math.round(56 + (245 - 56) * t);
    const g = Math.round(189 + (158 - 189) * t);
    const b = Math.round(248 + (11 - 248) * t);
    return `rgb(${r},${g},${b})`;
  };
  const hoverPoint = hovered != null && data[hovered] ? (() => {
    const d = data[hovered];
    const px = Number(d[xKey]) ?? Number(d.price) ?? 0;
    const py = Number(d[yKey]) ?? Number(d.quantity) ?? 0;
    const x = x0 + (px / maxX) * w;
    const y = pad.top + h - (py / maxY) * h;
    return { x, y, xVal: px, yVal: py, count: Number(data[hovered].count) ?? 1 };
  })() : null;
  const yTicks = 5;
  const xTicks = 5;
  return (
    <div className="chart-scroll-wrap">
      <div className="chart-inner" style={{ position: 'relative' }}>
        {hoverPoint && (
          <div className="chart-tooltip chart-tooltip-multiline" style={{ left: hoverPoint.x, top: hoverPoint.y - 8, transform: 'translate(-50%, -100%)' }}>
            <div><strong>{xLabel}:</strong> {hoverPoint.xVal.toLocaleString()}</div>
            <div><strong>{yLabel}:</strong> {hoverPoint.yVal.toLocaleString()}</div>
            <div className="chart-tooltip-muted">Invoice count: {hoverPoint.count.toLocaleString()}</div>
          </div>
        )}
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="chart-svg chart-svg-scatter">
          <line x1={x0} y1={pad.top} x2={x0} y2={y0} stroke="#64748b" strokeWidth="1" />
          <line x1={x0} y1={y0} x2={x0 + w} y2={y0} stroke="#64748b" strokeWidth="1" />
          <text x={x0 + w / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="#94a3b8" className="chart-axis-label">{xLabel} (x-axis)</text>
          <text x={pad.left - 10} y={pad.top + h / 2} textAnchor="middle" fontSize="11" fill="#94a3b8" className="chart-axis-label" transform={`rotate(-90, ${pad.left - 10}, ${pad.top + h / 2})`}>{yLabel} (y-axis)</text>
          {Array.from({ length: yTicks + 1 }, (_, i) => {
            const y = pad.top + h - (i / yTicks) * h;
            const val = (i / yTicks) * maxY;
            return <g key={`y-${i}`}><line x1={x0 - 4} y1={y} x2={x0} y2={y} stroke="#475569" strokeWidth="1" /><text x={x0 - 8} y={y + 4} textAnchor="end" fontSize="9" fill="#64748b">{val.toLocaleString(undefined, { maximumFractionDigits: 0 })}</text></g>;
          })}
          {Array.from({ length: xTicks + 1 }, (_, i) => {
            const x = x0 + (i / xTicks) * w;
            const val = (i / xTicks) * maxX;
            return <g key={`x-${i}`}><line x1={x} y1={y0} x2={x} y2={y0 + 4} stroke="#475569" strokeWidth="1" /><text x={x} y={y0 + 18} textAnchor="middle" fontSize="9" fill="#64748b">{val.toLocaleString(undefined, { maximumFractionDigits: 0 })}</text></g>;
          })}
          {data.map((d, i) => {
            const px = Number(d[xKey]) ?? Number(d.price) ?? 0;
            const py = Number(d[yKey]) ?? Number(d.quantity) ?? 0;
            const x = x0 + (px / maxX) * w;
            const y = pad.top + h - (py / maxY) * h;
            const fillColor = getColor(px);
            const r = 6;
            return (
              <circle key={i} cx={x} cy={y} r={hovered === i ? 8 : r} fill={fillColor} opacity={0.9} stroke="#475569" strokeWidth="1" style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
            );
          })}
        </svg>
        <div className="chart-legend chart-legend-scatter">
          <span><span className="legend-swatch" style={{ background: 'rgb(56,189,248)' }} /> Low {xLabel}</span>
          <span><span className="legend-swatch" style={{ background: 'rgb(245,158,11)' }} /> High {xLabel}</span>
        </div>
        <p className="chart-metric-note">
          <strong>Invoice count</strong> (on hover): Sum of invoices for each point. Each point = <strong>mean {xLabel.toLowerCase()}</strong> (x) and <strong>total {yLabel.toLowerCase()} sold</strong> (y); rows are grouped by price, then mean price and total quantity are computed per group; invoice count is the number of invoices (rows) in that group.
        </p>
      </div>
    </div>
  );
}

function DualLineChart({ data, width = 400, height = 200, primaryKey = 'cumulative_sales', secondaryKey = 'wow_pct', labelKey = 'weekLabel' }) {
  const [hovered, setHovered] = useState(null);
  if (!data?.length) return null;
  const chartWidth = Math.max(width, Math.min(800, 320 + data.length * 24));
  const primary = data.map((d) => Number(d[primaryKey]) || 0);
  const secondary = data.map((d) => Number(d[secondaryKey]) || 0);
  const maxP = Math.max(...primary, 1);
  const maxS = Math.max(Math.abs(Math.min(...secondary)), Math.max(...secondary), 1);
  const w = chartWidth - PAD.left - PAD.right;
  const h = height - PAD.top - PAD.bottom;
  const n = data.length - 1 || 1;
  const points1 = data.map((d, i) => {
    const x = PAD.left + (i / n) * w;
    const y = PAD.top + h - (primary[i] / maxP) * h;
    return `${x},${y}`;
  }).join(' ');
  const points2 = data.map((d, i) => {
    const x = PAD.left + (i / n) * w;
    const y = PAD.top + h / 2 - (secondary[i] / (maxS * 2)) * (h / 2);
    return `${x},${y}`;
  }).join(' ');
  const hoverPoint = hovered != null && data[hovered] ? (() => {
    const x = PAD.left + (hovered / n) * w;
    const y = PAD.top + h - (primary[hovered] / maxP) * h;
    return { x, y, label: data[hovered][labelKey]?.slice(0, 10) || `#${hovered + 1}`, cum: primary[hovered], wow: secondary[hovered] };
  })() : null;
  return (
    <div className="chart-scroll-wrap">
      <div className="chart-inner" style={{ position: 'relative' }}>
        {hoverPoint && (
          <div className="chart-tooltip" style={{ left: hoverPoint.x, top: hoverPoint.y - 8, transform: 'translate(-50%, -100%)' }}>
            {hoverPoint.label}: Cumulative ₹{hoverPoint.cum.toLocaleString()}, WoW {hoverPoint.wow}%
          </div>
        )}
        <svg width={chartWidth} height={height} viewBox={`0 0 ${chartWidth} ${height}`} preserveAspectRatio="xMinYMid meet" className="chart-svg">
          <polyline fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points1} shapeRendering="geometricPrecision" />
          <polyline fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6,4" strokeLinecap="round" strokeLinejoin="round" points={points2} shapeRendering="geometricPrecision" />
          {data.map((d, i) => {
            const x = PAD.left + (i / n) * w;
            const y = PAD.top + h - (primary[i] / maxP) * h;
            return <circle key={i} cx={x} cy={y} r={hovered === i ? 5 : 3} fill="#38bdf8" style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />;
          })}
          {data.map((d, i) => (
            <text key={i} x={PAD.left + (i / n) * w} y={height - 8} textAnchor="middle" fontSize="9" fill="#94a3b8">{d[labelKey]?.slice(0, 7) || i + 1}</text>
          ))}
        </svg>
        <div className="chart-legend">
          <span><span className="legend-swatch" style={{ background: '#38bdf8' }} /> Cumulative</span>
          <span><span className="legend-swatch" style={{ background: '#f59e0b', borderBottom: '2px dashed #f59e0b' }} /> WoW %</span>
        </div>
      </div>
    </div>
  );
}

function ForecastLineChart({ historical = [], forecast = [], width = 400, height = 220 }) {
  const [hovered, setHovered] = useState(null);
  const combined = [...historical, ...forecast];
  if (!combined.length) return null;
  const chartWidth = Math.max(width, 320 + combined.length * 20);
  const values = combined.map((d) => Number(d.value) || 0);
  const max = Math.max(...values, 1);
  const w = chartWidth - PAD.left - PAD.right;
  const h = height - PAD.top - PAD.bottom;
  const n = combined.length - 1 || 1;
  const allPoints = combined.map((d, i) => {
    const x = PAD.left + (i / n) * w;
    const y = PAD.top + h - ((Number(d.value) || 0) / max) * h;
    return { x, y };
  });
  const histPoints = historical.length > 0 ? allPoints.slice(0, historical.length).map((p) => `${p.x},${p.y}`).join(' ') : '';
  const forecastStart = historical.length > 0 ? historical.length - 1 : 0;
  const forecastPoints = (forecast.length > 0 ? allPoints.slice(forecastStart) : []).map((p) => `${p.x},${p.y}`).join(' ');
  const hoverPoint = hovered != null && combined[hovered] ? { ...allPoints[hovered], label: combined[hovered].week || combined[hovered].date || `W${hovered + 1}`, value: Number(combined[hovered].value) || 0 } : null;
  return (
    <div className="chart-scroll-wrap">
      <div className="chart-inner" style={{ position: 'relative' }}>
        {hoverPoint && (
          <div className="chart-tooltip" style={{ left: hoverPoint.x, top: hoverPoint.y - 8, transform: 'translate(-50%, -100%)' }}>
            {hoverPoint.label}: ₹{hoverPoint.value.toLocaleString()}
          </div>
        )}
        <svg width={chartWidth} height={height} viewBox={`0 0 ${chartWidth} ${height}`} preserveAspectRatio="xMinYMid meet" className="chart-svg">
          {histPoints && <polyline fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={histPoints} shapeRendering="geometricPrecision" />}
          {forecastPoints && <polyline fill="none" stroke="#34d399" strokeWidth="2" strokeDasharray="8,4" strokeLinecap="round" strokeLinejoin="round" points={forecastPoints} shapeRendering="geometricPrecision" />}
          {allPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={hovered === i ? 5 : 4} fill={i >= historical.length ? '#34d399' : '#38bdf8'} style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
          ))}
          {combined.map((d, i) => (
            <text key={i} x={allPoints[i]?.x} y={height - 8} textAnchor="middle" fontSize="9" fill="#94a3b8">{String(d.week || d.date || `W${i + 1}`).slice(0, 8)}</text>
          ))}
        </svg>
        <div className="chart-legend">
          <span><span className="legend-swatch" style={{ background: '#38bdf8' }} /> Historical</span>
          <span><span className="legend-swatch" style={{ background: '#34d399', borderBottom: '2px dashed #34d399' }} /> Forecast</span>
        </div>
      </div>
    </div>
  );
}

// Calendar picker for date filters: click to open, select day
function CalendarPicker({ value, onChange, placeholder = 'Select date', id }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) {
      const [y, m] = value.split('-').map(Number);
      return { year: y, month: m - 1 };
    }
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const daysInMonth = new Date(viewDate.year, viewDate.month + 1, 0).getDate();
  const firstDay = new Date(viewDate.year, viewDate.month, 1).getDay();
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const prevMonth = () => {
    if (viewDate.month === 0) setViewDate({ year: viewDate.year - 1, month: 11 });
    else setViewDate({ year: viewDate.year, month: viewDate.month - 1 });
  };
  const nextMonth = () => {
    if (viewDate.month === 11) setViewDate({ year: viewDate.year + 1, month: 0 });
    else setViewDate({ year: viewDate.year, month: viewDate.month + 1 });
  };
  const selectDay = (d) => {
    const y = viewDate.year;
    const m = String(viewDate.month + 1).padStart(2, '0');
    const day = String(d).padStart(2, '0');
    onChange(`${y}-${m}-${day}`);
    setOpen(false);
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div ref={ref} className="calendar-picker-wrap">
      <input
        id={id}
        type="text"
        readOnly
        value={value ? (() => {
          const [y, m, d] = value.split('-');
          return `${d}/${m}/${y}`;
        })() : ''}
        placeholder={placeholder}
        onClick={() => setOpen((o) => !o)}
        className="calendar-picker-input"
      />
      <button type="button" className="calendar-picker-btn" onClick={() => setOpen((o) => !o)} aria-label="Open calendar">
        📅
      </button>
      {open && (
        <div className="calendar-dropdown">
          <div className="calendar-header">
            <button type="button" className="calendar-nav" onClick={prevMonth} aria-label="Previous month">‹</button>
            <span className="calendar-title">{monthNames[viewDate.month]} {viewDate.year}</span>
            <button type="button" className="calendar-nav" onClick={nextMonth} aria-label="Next month">›</button>
          </div>
          <div className="calendar-weekdays">
            {dayNames.map((d) => <span key={d} className="calendar-weekday">{d}</span>)}
          </div>
          <div className="calendar-grid">
            {days.map((d, i) => (
              d == null ? <span key={`e-${i}`} className="calendar-day calendar-day-empty" /> : (
                <button key={d} type="button" className={'calendar-day' + (value === `${viewDate.year}-${String(viewDate.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` ? ' calendar-day-selected' : '')}
                  onClick={() => selectDay(d)}>
                  {d}
                </button>
              )
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Default dashboard data so the Performance dashboard always shows something (stub until API loads)
const DEFAULT_DASHBOARD = {
  dataset_id: null,
  kpis: { total_sales: 1150000, avg_monthly_growth_pct: 12.5, top_product: 'Packaged Snacks', top_region: 'Chennai' },
  charts: {
    sales_trend: [
      { month: 'Jan 2024', monthKey: '2024-01', value: 80000 }, { month: 'Feb 2024', monthKey: '2024-02', value: 90000 },
      { month: 'Mar 2024', monthKey: '2024-03', value: 110000 }, { month: 'Apr 2024', monthKey: '2024-04', value: 130000 },
      { month: 'May 2024', monthKey: '2024-05', value: 125000 }, { month: 'Jun 2024', monthKey: '2024-06', value: 140000 }
    ],
    daily_sales_trend: ['2024-01-15', '2024-01-20', '2024-02-10', '2024-03-05', '2024-04-08', '2024-05-11', '2024-06-03'].map((d, i) => ({ date: d, dateLabel: d, value: [85000, 42000, 92000, 51000, 45000, 58000, 140000][i] })),
    cumulative_and_wow: ['2024-01-07', '2024-01-14', '2024-01-21', '2024-02-04', '2024-02-11'].map((wk, i) => ({ weekKey: wk, weekLabel: wk, value: [120000, 135000, 128000, 140000, 155000][i], cumulative_sales: [120000, 255000, 383000, 523000, 678000][i], wow_pct: [0, 12.5, -5.2, 9.4, 10.7][i] })),
    product_breakdown: [
      { product: 'Packaged Snacks', value: 500000 }, { product: 'Beverages', value: 300000 },
      { product: 'Personal Care', value: 200000 }, { product: 'Dairy', value: 150000 }
    ],
    region_breakdown: [
      { region: 'Chennai', value: 450000 }, { region: 'Mumbai', value: 350000 }, { region: 'Delhi', value: 350000 }
    ],
    payment_breakdown: [],
    top10_products_by_volume: [
      { product: 'Packaged Snacks', value: 500000, volume: 5200 }, { product: 'Beverages', value: 300000, volume: 3100 },
      { product: 'Personal Care', value: 200000, volume: 2100 }, { product: 'Dairy', value: 150000, volume: 1500 }
    ],
    price_vs_quantity: []
  },
  filter_options: { products: ['Packaged Snacks', 'Beverages', 'Personal Care', 'Dairy'], locations: ['Chennai', 'Mumbai', 'Delhi'] }
};

export default function AnalyticsPage() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState(DEFAULT_DASHBOARD);
  const [forecast, setForecast] = useState(null);
  const [filters, setFilters] = useState({
    from: '',
    to: '',
    product: '',
    location: ''
  });
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [deckLoading, setDeckLoading] = useState(false);
  const chatEndRef = useRef(null);

  const loadSummary = async (filterOverrides = {}, options = {}) => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const params = new URLSearchParams();
      const f = { ...filters, ...filterOverrides };
      if (f.from) params.set('from', f.from);
      if (f.to) params.set('to', f.to);
      if (f.product) params.set('product', f.product);
      if (f.location) params.set('location', f.location);
      if (options.datasetId) params.set('dataset_id', String(options.datasetId));
      if (options.cacheBust) params.set('_t', String(Date.now()));
      const res = await api.get('/analytics/summary?' + params.toString());
      setSummary(res.data ?? DEFAULT_DASHBOARD);
    } catch (err) {
      console.error(err);
      setSummaryError(err.response?.data?.message || err.message || 'Failed to load dashboard. Check your connection and try again.');
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, []);

  const applyFilters = () => {
    loadSummary(); // uses current filters state; dashboard updates from setSummary(res.data)
  };

  const scrollChatToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollChatToBottom();
  }, [chatMessages]);

  const uploadFile = async (e) => {
    e.preventDefault();
    if (!file) {
      setStatus('Choose a file first.');
      return;
    }
    setStatus('Uploading dataset...');
    setSummaryError(null);
    const data = new FormData();
    data.append('file', file);
    try {
      const res = await api.post('/analytics/upload', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setStatus(res.data?.message ?? 'Upload complete.');
      const newId = res.data?.dataset_id;
      await loadSummary({}, { datasetId: newId, cacheBust: true });
    } catch (err) {
      setStatus(err.response?.data?.message || 'Upload failed');
    }
  };

  const loadForecast = async () => {
    setForecastLoading(true);
    setForecastError(null);
    try {
      const params = new URLSearchParams();
      if (summary?.dataset_id) params.set('dataset_id', String(summary.dataset_id));
      const res = await api.get('/analytics/forecast' + (params.toString() ? '?' + params.toString() : ''));
      setForecast(res.data ?? null);
    } catch (err) {
      console.error(err);
      setForecastError(err.response?.data?.message || err.message || 'Failed to load forecast.');
    } finally {
      setForecastLoading(false);
    }
  };

  const sendChatMessage = async (e) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: text }]);
    setChatLoading(true);
    try {
      const res = await api.post('/chat/analytics', {
        question: text,
        history: chatMessages.slice(-6)
      });
      setChatMessages((prev) => [...prev, { role: 'assistant', content: res.data.message }]);
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: err.response?.data?.message || 'Sorry, something went wrong. Please try again.' }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const downloadDeck = async (format = 'pptx') => {
    setDeckLoading(true);
    setStatus('');
    const isPdf = format === 'pdf';
    try {
      const url = isPdf ? '/analytics/story-deck?format=pdf' : '/analytics/story-deck';
      const res = await api.get(url, { responseType: 'blob' });
      if (res.status !== 200) {
        const text = await new Promise((r) => {
          const reader = new FileReader();
          reader.onload = () => r(reader.result);
          reader.readAsText(res.data);
        });
        const json = JSON.parse(text);
        setStatus(json.message || 'Download failed');
        return;
      }
      const urlObj = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = urlObj;
      link.setAttribute('download', isPdf ? 'msme-story-deck.pdf' : 'msme-story-deck.pptx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(urlObj);
    } catch (err) {
      console.error(err);
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const json = JSON.parse(text);
          setStatus(json.message || 'Download failed');
        } catch (_) {
          setStatus('Download failed');
        }
      } else {
        setStatus(err.response?.data?.message || 'Download failed');
      }
    } finally {
      setDeckLoading(false);
    }
  };

  const charts = summary?.charts ?? {};
  const salesTrend = Array.isArray(charts.sales_trend) ? charts.sales_trend : [];
  const dailySalesTrend = Array.isArray(charts.daily_sales_trend) && charts.daily_sales_trend.length > 0 ? charts.daily_sales_trend : salesTrend;
  const productBreakdown = Array.isArray(charts.product_breakdown) ? charts.product_breakdown : [];
  const regionBreakdown = Array.isArray(charts.region_breakdown) ? charts.region_breakdown : [];
  const top10ByVolume = Array.isArray(charts.top10_products_by_volume) ? charts.top10_products_by_volume : [];
  const priceVsQuantity = Array.isArray(charts.price_vs_quantity) ? charts.price_vs_quantity : [];
  const cumulativeAndWow = Array.isArray(charts.cumulative_and_wow) ? charts.cumulative_and_wow : [];
  const paymentBreakdown = Array.isArray(charts.payment_breakdown) ? charts.payment_breakdown : [];
  const maxProduct = productBreakdown.length ? Math.max(...productBreakdown.map((d) => Number(d.value) || 0)) : 1;
  const maxVolume = top10ByVolume.length ? Math.max(...top10ByVolume.map((d) => Number(d.volume) || 0)) : 1;
  const maxRegion = regionBreakdown.length ? Math.max(...regionBreakdown.map((d) => Number(d.value) || 0)) : 1;
  const maxPayment = paymentBreakdown.length ? Math.max(...paymentBreakdown.map((d) => Number(d.value) || 0)) : 1;
  const filterProducts = Array.isArray(summary?.filter_options?.products) ? summary.filter_options.products : [];
  const filterLocations = Array.isArray(summary?.filter_options?.locations) ? summary.filter_options.locations : [];

  return (
    <div className="grid-2">
      <section className="card">
        <h2>Performance Dashboard</h2>
        <p className="muted">
          Upload a CSV or Excel file (date, sales/amount, product name, store location). Use filters below and click Apply to update the dashboard.
        </p>

        <div className="filters-bar">
          <label>
            Product Name
            <select
              value={filters.product}
              onChange={(e) => setFilters((f) => ({ ...f, product: e.target.value }))}
            >
              <option value="">All products</option>
              {filterProducts.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Store Location
            <select
              value={filters.location}
              onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))}
            >
              <option value="">All locations</option>
              {filterLocations.map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </label>
          <label>
            Date from (dd/mm/yyyy)
            <CalendarPicker
              id="filter-date-from"
              value={filters.from}
              onChange={(v) => setFilters((f) => ({ ...f, from: v }))}
              placeholder="Pick start date"
            />
          </label>
          <label>
            Date to (dd/mm/yyyy)
            <CalendarPicker
              id="filter-date-to"
              value={filters.to}
              onChange={(v) => setFilters((f) => ({ ...f, to: v }))}
              placeholder="Pick end date"
            />
          </label>
          <button
            type="button"
            className="btn-secondary"
            onClick={applyFilters}
            disabled={summaryLoading}
          >
            {summaryLoading ? 'Applying…' : 'Apply filters'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setFilters({ from: '', to: '', product: '', location: '' });
              loadSummary({ from: '', to: '', product: '', location: '' });
            }}
            disabled={summaryLoading}
          >
            Reset filters
          </button>
        </div>

        <form onSubmit={uploadFile} className="form-inline">
          <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files[0])} />
          <button className="btn-secondary" type="submit">
            Upload dataset
          </button>
        </form>
        {status && <div className="status">{status}</div>}
        {summaryError && (
          <div className="status" style={{ color: '#f87171' }}>
            {summaryError}
            <button type="button" className="btn-secondary" onClick={() => loadSummary()} style={{ marginLeft: '0.5rem' }}>Retry</button>
          </div>
        )}

        {summary && (
          <>
            {summaryLoading && (
              <div className="muted" style={{ marginBottom: '0.5rem' }}>Updating KPIs and charts…</div>
            )}
            <div className="kpi-row">
              <div className="kpi">
                <div className="kpi-label">Total Sales</div>
                <div className="kpi-value">₹{Number(summary.kpis?.total_sales ?? 0).toLocaleString()}</div>
                {summary.kpis?.total_sales_pct_change_vs_last_week != null && (
                  <div className={`kpi-change ${(summary.kpis.total_sales_pct_change_vs_last_week >= 0) ? 'positive' : 'negative'}`}>
                    {summary.kpis.total_sales_pct_change_vs_last_week >= 0 ? '+' : ''}{summary.kpis.total_sales_pct_change_vs_last_week}% vs last week
                  </div>
                )}
              </div>
              <div className="kpi">
                <div className="kpi-label">Total quantity sold</div>
                <div className="kpi-value">{Number(summary.kpis?.total_quantity_sold ?? 0).toLocaleString()}</div>
                {summary.kpis?.total_quantity_sold_pct_change_vs_last_week != null && (
                  <div className={`kpi-change ${(summary.kpis.total_quantity_sold_pct_change_vs_last_week >= 0) ? 'positive' : 'negative'}`}>
                    {summary.kpis.total_quantity_sold_pct_change_vs_last_week >= 0 ? '+' : ''}{summary.kpis.total_quantity_sold_pct_change_vs_last_week}% vs last week
                  </div>
                )}
              </div>
              <div className="kpi">
                <div className="kpi-label">Total Profit</div>
                <div className="kpi-value">₹{Number(summary.kpis?.total_profit ?? 0).toLocaleString()}</div>
                {summary.kpis?.total_profit_pct_change_vs_last_week != null && (
                  <div className={`kpi-change ${(summary.kpis.total_profit_pct_change_vs_last_week >= 0) ? 'positive' : 'negative'}`}>
                    {summary.kpis.total_profit_pct_change_vs_last_week >= 0 ? '+' : ''}{summary.kpis.total_profit_pct_change_vs_last_week}% vs last week
                  </div>
                )}
              </div>
              <div className="kpi">
                <div className="kpi-label">Avg. Profit Margin</div>
                <div className="kpi-value">{summary.kpis?.avg_profit_margin != null ? `${summary.kpis.avg_profit_margin}%` : 'N/A'}</div>
              </div>
              <div className="kpi">
                <div className="kpi-label">Total Invoice count</div>
                <div className="kpi-value">{Number(summary.kpis?.total_invoice_count ?? 0).toLocaleString()}</div>
                {summary.kpis?.total_invoice_count_pct_change_vs_last_week != null && (
                  <div className={`kpi-change ${(summary.kpis.total_invoice_count_pct_change_vs_last_week >= 0) ? 'positive' : 'negative'}`}>
                    {summary.kpis.total_invoice_count_pct_change_vs_last_week >= 0 ? '+' : ''}{summary.kpis.total_invoice_count_pct_change_vs_last_week}% vs last week
                  </div>
                )}
              </div>
            </div>
            {!summaryLoading && (summary.kpis?.total_sales ?? 0) === 0 && (dailySalesTrend.length + productBreakdown.length + regionBreakdown.length) === 0 && (
              <div className="muted" style={{ marginTop: '0.5rem' }}>No data for the selected filters. Try different dates, product, or location.</div>
            )}

            <div className="dashboard-charts-grid">
            <div className="chart-card">
              <h3>1. Daily sales trend</h3>
              <div className="chart-container chart-container-line">
                {(dailySalesTrend.length > 0 || salesTrend.length > 0) ? (
                  <LineChart
                    data={dailySalesTrend.length ? dailySalesTrend : salesTrend}
                    width={400}
                    height={240}
                    valueKey="value"
                    labelKey={charts.daily_sales_trend?.length > 0 ? 'dateLabel' : 'month'}
                    color="#38bdf8"
                    legendLabel="Daily sales"
                  />
                ) : (
                  <p className="muted" style={{ padding: '2rem' }}>No trend data. Upload a dataset or adjust filters.</p>
                )}
              </div>
            </div>

            <div className="chart-card">
              <h3>2. Sales by product category</h3>
              <div className="chart-container chart-container-pie">
                {productBreakdown.length > 0 ? <PieChart data={productBreakdown} size={200} /> : <p className="muted" style={{ padding: '2rem' }}>No product data.</p>}
              </div>
            </div>

            <div className="chart-card">
              <h3>3. Sales share by store location</h3>
              <div className="chart-container chart-container-pie">
                {regionBreakdown.length > 0 ? <PieChart data={regionBreakdown} size={200} /> : <p className="muted" style={{ padding: '2rem' }}>No location data.</p>}
              </div>
            </div>

            <div className="chart-card">
              <h3>4. Top 10 products by volume</h3>
              <div className="chart-container product-chart">
                {top10ByVolume.length > 0 ? top10ByVolume.map((p) => (
                  <div key={p.product} className="bar-row" title={`${p.product}: Volume ${Number(p.volume).toLocaleString()}`}>
                    <span className="bar-row-label">{p.product}</span>
                    <div className="bar-row-track">
                      <div className="bar-row-fill" style={{ width: `${(p.volume / maxVolume) * 100}%`, minWidth: 2, background: 'linear-gradient(90deg, #14b8a6, #5eead4)' }} />
                    </div>
                    <span className="bar-row-value">{Number(p.volume).toLocaleString()}</span>
                  </div>
                )) : <p className="muted" style={{ padding: '2rem' }}>No volume data.</p>}
              </div>
            </div>

            <div className="chart-card chart-card-full">
              <h3>5. Price vs quantity sold correlation</h3>
              <p className="muted chart-desc">Each point: price (x) vs quantity (y).</p>
              <div className="chart-container chart-container-scatter">
                {priceVsQuantity.length > 0 ? <ScatterChart data={priceVsQuantity} width={420} height={260} xKey="price" yKey="quantity" xLabel="Price" yLabel="Quantity" /> : <p className="muted" style={{ padding: '2rem' }}>No price/quantity data.</p>}
              </div>
            </div>

            <div className="chart-card chart-card-spacing-top">
              <h3>6. Cumulative sales growth &amp; Week-over-week % change</h3>
              <div className="chart-container chart-container-line">
                {cumulativeAndWow.length > 0 ? <DualLineChart data={cumulativeAndWow} width={400} height={200} primaryKey="cumulative_sales" secondaryKey="wow_pct" labelKey="weekLabel" /> : <p className="muted" style={{ padding: '2rem' }}>No weekly data.</p>}
              </div>
            </div>
            </div>

            <button
              className="btn-secondary"
              onClick={loadForecast}
              disabled={forecastLoading}
              style={{ marginTop: '1.5rem' }}
            >
              {forecastLoading ? 'Loading forecast…' : 'View sales forecast'}
            </button>
            {forecastError && (
              <div className="status" style={{ color: '#f87171', marginTop: '0.5rem' }}>
                {forecastError}
                <button type="button" className="btn-secondary" onClick={loadForecast} style={{ marginLeft: '0.5rem' }}>Retry</button>
              </div>
            )}
            {forecast && (forecast.weekly_historical?.length > 0 || forecast.weekly_forecast?.length > 0) && (
              <div className="forecast forecast-section">
                <h3>Sales forecast — weekly trend &amp; next 4 weeks</h3>
                <div className="forecast-meta">
                  <span><strong>ML algorithm:</strong> {forecast.model_name || '—'}</span>
                  <span><strong>Accuracy:</strong> {forecast.accuracy ?? 'N/A'}</span>
                </div>
                <div className="chart-container chart-container-line">
                  <ForecastLineChart
                    historical={forecast.weekly_historical || []}
                    forecast={forecast.weekly_forecast || []}
                    width={400}
                    height={240}
                  />
                </div>
                <p className="muted chart-desc">Solid line: historical weekly sales. Dotted line: forecast for next 4 weeks.</p>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card analytics-chat-card">
        <h2>Analytics assistant</h2>
        <p className="muted">
          Ask questions about your uploaded dataset—sales, products, store locations, payment modes, trends. Answers are based on your data; with Ollama running locally, answers use a local LLM.
        </p>

        <div className="chat-window">
          {chatMessages.length === 0 && (
            <div className="chat-placeholder">
              Type a message below to start. Try: &quot;What was my top product?&quot; or &quot;Hello&quot;
            </div>
          )}
          {chatMessages.map((msg, i) => (
            <div key={i} className={`chat-bubble ${msg.role}`}>
              <div className="chat-bubble-content">{msg.content}</div>
            </div>
          ))}
          {chatLoading && (
            <div className="chat-bubble assistant">
              <div className="chat-bubble-content">Thinking...</div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={sendChatMessage} className="chat-form">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Type your question..."
            disabled={chatLoading}
          />
          <button type="submit" className="btn-primary" disabled={chatLoading}>
            Send
          </button>
        </form>

        <hr style={{ margin: '1rem 0' }} />
        <h3>Story deck for pitches</h3>
        <p className="muted">
          Download your performance story as a <strong>PowerPoint</strong> (story-flow slides with graphics) or <strong>PDF</strong> (flowing narrative). Both use the same data and are ready to pitch.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            className="btn-primary"
            onClick={() => downloadDeck('pptx')}
            disabled={deckLoading}
          >
            {deckLoading ? 'Generating...' : 'Download as PowerPoint'}
          </button>
          <button
            className="btn-secondary"
            onClick={() => downloadDeck('pdf')}
            disabled={deckLoading}
          >
            {deckLoading ? 'Generating...' : 'Download as PDF'}
          </button>
        </div>
        {status && status.includes('Download') && <div className="status">{status}</div>}
      </section>
    </div>
  );
}
