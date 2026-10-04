// Keyword -> category rules. First match wins; order matters (specific before generic).
const CATEGORY_RULES = [
  ['Food & Dining', ['food', 'lunch', 'dinner', 'breakfast', 'restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'swiggy', 'zomato', 'snack', 'canteen', 'mess', 'tea']],
  ['Groceries', ['grocery', 'groceries', 'supermarket', 'vegetable', 'kirana', 'bigbasket']],
  ['Transport', ['uber', 'ola', 'taxi', 'bus', 'train', 'metro', 'fuel', 'petrol', 'diesel', 'cab', 'auto', 'fare', 'rapido']],
  ['Housing', ['rent', 'hostel', 'pg ', 'maintenance', 'electricity', 'wifi', 'broadband']],
  ['Education', ['book', 'tuition', 'course', 'fees', 'fee', 'stationery', 'exam', 'library', 'udemy', 'coursera']],
  ['Entertainment', ['movie', 'netflix', 'spotify', 'prime video', 'game', 'concert', 'party', 'outing', 'bookmyshow']],
  ['Subscriptions', ['subscription', 'membership']],
  ['Shopping', ['amazon', 'flipkart', 'clothes', 'shoes', 'myntra', 'mall', 'shopping']],
  ['Health', ['medicine', 'doctor', 'hospital', 'pharmacy', 'gym']],
  ['Utilities', ['recharge', 'mobile bill', 'phone bill', 'water bill']],
];

function categorize(description) {
  const text = (description || '').toLowerCase();
  for (const [category, keywords] of CATEGORY_RULES) {
    if (keywords.some((kw) => text.includes(kw))) return category;
  }
  return 'Other';
}

function monthKey(dateStr) {
  return (dateStr || '').slice(0, 7); // "YYYY-MM"
}

function mean(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

// Flags: (a) categories where current-month spend is well above the same
// category's average in prior months, (b) single transactions that are
// unusually large compared to that category's typical transaction.
// ponytail: thresholds are fixed heuristics (1.4x / 2x), not learned — fine
// for a personal tracker; revisit with real stddev-based scoring if this
// starts misfiring on someone's actual data.
function computeInsights(expenses) {
  const insights = [];
  if (!expenses.length) return insights;

  const months = [...new Set(expenses.map((e) => monthKey(e.date)))].sort();
  const currentMonth = months[months.length - 1];
  const priorMonths = months.slice(0, -1);

  // (a) category spend this month vs average of prior months
  if (priorMonths.length) {
    const byCategory = {};
    for (const e of expenses) {
      byCategory[e.category] ??= {};
      byCategory[e.category][monthKey(e.date)] = (byCategory[e.category][monthKey(e.date)] || 0) + e.amount;
    }
    for (const [category, byMonth] of Object.entries(byCategory)) {
      const current = byMonth[currentMonth] || 0;
      const priorAvg = mean(priorMonths.map((m) => byMonth[m] || 0));
      if (priorAvg > 0 && current > priorAvg * 1.4) {
        const pct = Math.round((current / priorAvg - 1) * 100);
        insights.push(`${category} spending is up ${pct}% this month vs. your usual (₹${current.toFixed(0)} vs. avg ₹${priorAvg.toFixed(0)}).`);
      }
    }
  }

  // (b) outlier single transactions within their category
  const amountsByCategory = {};
  for (const e of expenses) {
    (amountsByCategory[e.category] ??= []).push(e.amount);
  }
  for (const e of expenses) {
    const amounts = amountsByCategory[e.category];
    if (amounts.length < 3) continue;
    const avg = mean(amounts);
    if (avg > 0 && e.amount > avg * 2) {
      insights.push(`Unusually large ${e.category} expense: ₹${e.amount.toFixed(0)} ("${e.description}") vs. a typical ₹${avg.toFixed(0)}.`);
    }
  }

  return insights;
}

function categoryTotals(expenses) {
  const totals = {};
  for (const e of expenses) totals[e.category] = (totals[e.category] || 0) + e.amount;
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

// Chronological (oldest -> newest), unlike categoryTotals which sorts by amount.
function monthlyTotals(expenses) {
  const totals = {};
  for (const e of expenses) totals[monthKey(e.date)] = (totals[monthKey(e.date)] || 0) + e.amount;
  return Object.entries(totals).sort((a, b) => a[0].localeCompare(b[0]));
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function prevMonthKey(key) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 2, 1); // m is 1-indexed; m-2 lands on the previous month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// null when there's nothing to compare against (avoids a misleading "+Infinity%").
function percentChange(current, previous) {
  if (!previous) return null;
  return Math.round((current / previous - 1) * 100);
}

// monthTotals must be chronological (oldest -> newest), as monthlyTotals() returns.
function monthsInRange(monthTotals, rangeKey) {
  if (rangeKey === 'all') return monthTotals;
  return monthTotals.slice(-Number(rangeKey));
}

const CATEGORY_COLORS = {
  'Food & Dining': '#E0607A', 'Groceries': '#3FA67A', 'Transport': '#3E8FCB',
  'Housing': '#5452C0', 'Education': '#E09A4A', 'Entertainment': '#B8922A',
  'Subscriptions': '#C65D3D', 'Shopping': '#8E5F98', 'Health': '#2CA6A4',
  'Utilities': '#5D86D6', 'Other': '#6B6894',
};
function categoryColor(category) {
  return CATEGORY_COLORS[category] || '#6B6894';
}

if (typeof module !== 'undefined') {
  module.exports = {
    categorize, monthKey, mean, computeInsights, categoryTotals, monthlyTotals, monthLabel,
    prevMonthKey, percentChange, monthsInRange, categoryColor, CATEGORY_RULES,
  };
}

// ---- DOM wiring (skipped entirely under Node/test) ----
if (typeof document !== 'undefined') {
  const API_BASE = '/api/expenses';
  let expenses = [];
  let selectedMonth = null;
  let selectedRange = 'all';

  // ---------------- screens ----------------
  const screens = {
    signup: document.getElementById('screen-signup'),
    signin: document.getElementById('screen-signin'),
    dashboard: document.getElementById('screen-dashboard'),
  };
  function showScreen(key) {
    for (const [k, el] of Object.entries(screens)) el.hidden = k !== key;
  }
  document.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => showScreen(btn.dataset.goto));
  });

  function enterDashboard(email) {
    document.getElementById('current-email').textContent = email;
    showScreen('dashboard');
    loadExpenses();
  }

  function wireAuthForm(formId, endpoint, errorBannerId, errorTextId) {
    const form = document.getElementById(formId);
    const errorBanner = document.getElementById(errorBannerId);
    const errorText = document.getElementById(errorTextId);
    const emailInput = document.getElementById(`${formId.replace('-form', '')}-email`);
    const passwordInput = document.getElementById(`${formId.replace('-form', '')}-password`);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.value.trim(), password: passwordInput.value }),
      });
      const data = await res.json();
      if (!res.ok) {
        errorText.textContent = data.detail || 'Something went wrong';
        errorBanner.hidden = false;
        return;
      }
      errorBanner.hidden = true;
      form.reset();
      enterDashboard(data.email);
    });
  }
  wireAuthForm('signup-form', '/api/auth/signup', 'signup-error', 'signup-error-text');
  wireAuthForm('signin-form', '/api/auth/login', 'signin-error', 'signin-error-text');

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    expenses = [];
    selectedMonth = null;
    showScreen('signin');
  });

  async function checkAuth() {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      enterDashboard(data.email);
    } else {
      showScreen('signup');
    }
  }

  // ---------------- add expense ----------------
  const descInput = document.getElementById('exp-desc');
  const amountInput = document.getElementById('exp-amount');
  const dateInput = document.getElementById('exp-date');
  const categorySelect = document.getElementById('exp-category');
  const addExpenseForm = document.getElementById('add-expense-form');

  dateInput.value = new Date().toISOString().slice(0, 10);
  descInput.addEventListener('input', () => {
    categorySelect.value = categorize(descInput.value);
  });

  addExpenseForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const amount = parseFloat(amountInput.value);
    if (!amount || amount <= 0) return;
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: descInput.value.trim() || '(no description)',
        amount,
        category: categorySelect.value || categorize(descInput.value),
        date: dateInput.value,
      }),
    });
    if (res.status === 401) return showScreen('signin');
    const created = await res.json();
    expenses.push(created);
    addExpenseForm.reset();
    dateInput.value = new Date().toISOString().slice(0, 10);
    categorySelect.value = 'Food & Dining';
    render();
  });

  // ---------------- import statement ----------------
  const importForm = document.getElementById('import-form');
  const importFileInput = document.getElementById('import-file');
  const importFilenameEl = document.getElementById('import-filename');
  const importStatusEl = document.getElementById('import-status');

  importFileInput.addEventListener('change', () => {
    if (importFileInput.files.length) importFilenameEl.textContent = importFileInput.files[0].name;
  });

  importForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const file = importFileInput.files[0];
    if (!file) return;
    importStatusEl.textContent = 'Importing…';
    importStatusEl.className = 'import-status';
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/import`, { method: 'POST', body: formData });
      if (res.status === 401) return showScreen('signin');
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Import failed');
      importStatusEl.textContent = `Imported ${data.imported} of ${data.total_rows} transactions` +
        (data.skipped_duplicates ? ` (${data.skipped_duplicates} already in your tracker).` : '.');
      importStatusEl.className = 'import-status ok';
      importForm.reset();
      importFilenameEl.textContent = 'Choose .csv, .pdf or .xlsx';
      await loadExpenses();
    } catch (err) {
      importStatusEl.textContent = err.message;
      importStatusEl.className = 'import-status error';
    }
  });

  // ---------------- overview range filter ----------------
  const rangeFilterEl = document.getElementById('range-filter');
  rangeFilterEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    selectedRange = btn.dataset.range;
    render();
  });

  const statTotalEl = document.getElementById('stat-total');
  const statAvgEl = document.getElementById('stat-avg');
  const statTopEl = document.getElementById('stat-top');
  const statCountEl = document.getElementById('stat-count');

  function renderStats(rangedMonths, rangedExpenses) {
    const total = rangedExpenses.reduce((sum, e) => sum + e.amount, 0);
    const avg = rangedMonths.length ? total / rangedMonths.length : 0;
    const topCategory = categoryTotals(rangedExpenses)[0];
    statTotalEl.textContent = `₹${total.toFixed(0)}`;
    statAvgEl.textContent = `₹${avg.toFixed(0)}`;
    statTopEl.textContent = topCategory ? topCategory[0] : '—';
    statCountEl.textContent = String(rangedExpenses.length);
  }

  // ---------------- trend chart (SVG) ----------------
  const chartWrapEl = document.getElementById('chart-wrap');
  const VB_W = 700, VB_H = 220, PAD_L = 42, PAD_R = 14, PAD_T = 22, PAD_B = 28;

  function renderTrend(months) {
    if (!months.length) {
      chartWrapEl.innerHTML = '<p class="muted">Log an expense to see your trend.</p>';
      return;
    }
    const w = VB_W - PAD_L - PAD_R, h = VB_H - PAD_T - PAD_B;
    const vals = months.map(([, amt]) => amt);
    const minV = Math.min(...vals) * 0.85;
    const maxV = Math.max(...vals, 1) * 1.08;
    const span = maxV - minV || 1;
    const step = months.length > 1 ? w / (months.length - 1) : 0;
    const pts = months.map(([key, amt], i) => ({
      key, amt, x: PAD_L + step * i, y: PAD_T + h - ((amt - minV) / span) * h,
    }));

    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1];
    const areaPath = `${linePath} L${last.x.toFixed(1)},${PAD_T + h} L${pts[0].x.toFixed(1)},${PAD_T + h} Z`;

    const gridLines = [0, 0.5, 1].map((f) => {
      const y = PAD_T + h * f;
      const val = maxV - span * f;
      return `<line x1="${PAD_L}" x2="${VB_W - PAD_R}" y1="${y}" y2="${y}" stroke="var(--border)" stroke-width="1"/>` +
        `<text x="4" y="${y + 4}" font-size="10" fill="var(--text-faint)">₹${val >= 1000 ? (val / 1000).toFixed(1) + 'k' : Math.round(val)}</text>`;
    }).join('');

    const labels = pts.map((p) =>
      `<text x="${p.x}" y="${VB_H - 8}" font-size="10.5" fill="var(--text-faint)" text-anchor="middle">${monthLabel(p.key)}</text>`
    ).join('');

    const circles = pts.map((p) => {
      const sel = p.key === selectedMonth ? ' selected' : '';
      return `<g class="chart-point${sel}" data-key="${p.key}">` +
        `<circle cx="${p.x}" cy="${p.y}" r="10" fill="transparent"/>` +
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="var(--surface)" stroke="var(--primary)" stroke-width="2.4"/>` +
        `<title>${monthLabel(p.key)}: ₹${p.amt.toFixed(0)}</title></g>`;
    }).join('');

    chartWrapEl.innerHTML = `<svg viewBox="0 0 ${VB_W} ${VB_H}" xmlns="http://www.w3.org/2000/svg">` +
      `<defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#5452C0" stop-opacity=".28"/>` +
      `<stop offset="1" stop-color="#5452C0" stop-opacity="0"/>` +
      `</linearGradient></defs>${gridLines}` +
      `<path d="${areaPath}" fill="url(#trendFill)"/>` +
      `<path d="${linePath}" fill="none" stroke="var(--primary)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>` +
      `${circles}${labels}</svg>`;

    chartWrapEl.querySelectorAll('.chart-point').forEach((g) => {
      g.addEventListener('click', () => selectMonth(g.dataset.key));
    });
  }

  // ---------------- 3D wave month selector ----------------
  const waveStageEl = document.getElementById('wave-stage');
  const waveDeckEl = document.getElementById('wave-deck');
  const wavePrevEl = document.getElementById('wave-prev');
  const waveNextEl = document.getElementById('wave-next');
  const wave = { months: [], activeIdx: -1, x: 0, y: 0, tx: 0, ty: 0, raf: null };

  function renderWave(months) {
    wave.months = months;
    const idx = months.findIndex(([key]) => key === selectedMonth);
    wave.activeIdx = idx >= 0 ? idx : months.length - 1;

    waveDeckEl.innerHTML = months.map(([key, amt], i) => {
      const monthExpenses = expenses.filter((e) => monthKey(e.date) === key);
      const top = categoryTotals(monthExpenses)[0];
      const color = top ? categoryColor(top[0]) : categoryColor('Other');
      return `<div class="wave-card" data-i="${i}">` +
        `<span class="wc-dot" style="background:${color}"></span>` +
        `<span class="wc-month">${monthLabel(key)}</span>` +
        `<span class="wc-amt num">₹${amt.toFixed(0)}</span></div>`;
    }).join('');
    waveDeckEl.querySelectorAll('.wave-card').forEach((card) => {
      card.addEventListener('click', () => selectMonth(wave.months[Number(card.dataset.i)][0]));
    });

    applyWaveTransforms();
    wavePrevEl.disabled = wave.activeIdx <= 0;
    waveNextEl.disabled = wave.activeIdx === -1 || wave.activeIdx >= months.length - 1;
  }

  function applyWaveTransforms() {
    const cards = waveDeckEl.querySelectorAll('.wave-card');
    const spacing = window.innerWidth < 600 ? 76 : 100;
    cards.forEach((card, i) => {
      const offset = i - wave.activeIdx;
      const absOffset = Math.abs(offset);
      const tx = offset * spacing + wave.x * 14;
      const ty = Math.sin(offset * 0.5) * 20 + wave.y * 9;
      const tz = -absOffset * 78;
      const ry = -offset * 14 + wave.x * 9;
      const rx = Math.cos(offset * 0.4) * 5 - wave.y * 7;
      const scale = Math.max(0.72, 1 - absOffset * 0.13);
      const opacity = absOffset > 4 ? 0 : 1 - absOffset * 0.22;
      card.style.transform = `translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,${tz.toFixed(1)}px) rotateY(${ry.toFixed(1)}deg) rotateX(${rx.toFixed(1)}deg) scale(${scale.toFixed(2)})`;
      card.style.opacity = String(opacity);
      card.style.pointerEvents = absOffset > 4 ? 'none' : 'auto';
      card.style.zIndex = String(100 - absOffset);
      card.classList.toggle('active', offset === 0);
    });
  }

  function waveLoop() {
    wave.x += (wave.tx - wave.x) * 0.12;
    wave.y += (wave.ty - wave.y) * 0.12;
    applyWaveTransforms();
    if (Math.abs(wave.tx - wave.x) > 0.001 || Math.abs(wave.ty - wave.y) > 0.001) {
      wave.raf = requestAnimationFrame(waveLoop);
    } else {
      wave.raf = null;
    }
  }
  function kickWave() { if (!wave.raf) wave.raf = requestAnimationFrame(waveLoop); }

  waveStageEl.addEventListener('mousemove', (ev) => {
    const rect = waveStageEl.getBoundingClientRect();
    wave.tx = ((ev.clientX - rect.left) / rect.width - 0.5) * 2;
    wave.ty = ((ev.clientY - rect.top) / rect.height - 0.5) * 2;
    kickWave();
  });
  waveStageEl.addEventListener('mouseleave', () => { wave.tx = 0; wave.ty = 0; kickWave(); });
  wavePrevEl.addEventListener('click', () => { if (wave.activeIdx > 0) selectMonth(wave.months[wave.activeIdx - 1][0]); });
  waveNextEl.addEventListener('click', () => { if (wave.activeIdx < wave.months.length - 1) selectMonth(wave.months[wave.activeIdx + 1][0]); });
  window.addEventListener('resize', applyWaveTransforms);

  function selectMonth(key) {
    selectedMonth = key;
    render();
  }

  // ---------------- month breakdown ----------------
  const breakdownTotalEl = document.getElementById('breakdown-total');
  const breakdownChangeEl = document.getElementById('breakdown-change');
  const breakdownEmptyEl = document.getElementById('breakdown-empty');
  const breakdownContentEl = document.getElementById('breakdown-content');
  const donutSvgEl = document.getElementById('donut-svg');
  const donutLegendEl = document.getElementById('donut-legend');
  const largestTxListEl = document.getElementById('largest-tx-list');

  function renderDonut(catTotals, total) {
    const r = 60, cx = 75, cy = 75, circumference = 2 * Math.PI * r;
    let offset = 0;
    const segs = catTotals.map(([category, amt], i) => {
      const len = (amt / total) * circumference;
      const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${categoryColor(category)}" stroke-width="18" ` +
        `stroke-dasharray="${len.toFixed(1)} ${(circumference - len).toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}" ` +
        `transform="rotate(-90 ${cx} ${cy})" data-idx="${i}"/>`;
      offset += len;
      return seg;
    }).join('');
    donutSvgEl.innerHTML = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="18"/>${segs}`;

    donutLegendEl.innerHTML = catTotals.map(([category, amt], i) => `
      <li data-idx="${i}">
        <span class="dot" style="background:${categoryColor(category)}"></span>
        <span class="name">${category}</span>
        <span class="amt num">₹${amt.toFixed(0)}</span>
        <span class="pct num">${((amt / total) * 100).toFixed(0)}%</span>
      </li>`).join('');
    donutLegendEl.querySelectorAll('li').forEach((li) => {
      const seg = donutSvgEl.querySelector(`circle[data-idx="${li.dataset.idx}"]`);
      if (!seg) return;
      li.addEventListener('mouseenter', () => seg.setAttribute('stroke-width', '22'));
      li.addEventListener('mouseleave', () => seg.setAttribute('stroke-width', '18'));
    });
  }

  function renderBreakdown() {
    if (!selectedMonth) {
      breakdownTotalEl.textContent = 'No data yet';
      breakdownChangeEl.textContent = '';
      breakdownChangeEl.className = 'change-badge';
      breakdownEmptyEl.hidden = false;
      breakdownContentEl.hidden = true;
      return;
    }

    const monthExpenses = expenses.filter((e) => monthKey(e.date) === selectedMonth);
    const monthTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
    breakdownTotalEl.textContent = `${monthLabel(selectedMonth)} · ₹${monthTotal.toFixed(0)}`;

    const prevEntry = monthlyTotals(expenses).find(([key]) => key === prevMonthKey(selectedMonth));
    const delta = percentChange(monthTotal, prevEntry ? prevEntry[1] : 0);
    if (delta === null) {
      breakdownChangeEl.textContent = '';
      breakdownChangeEl.className = 'change-badge';
    } else {
      breakdownChangeEl.className = `change-badge ${delta > 0 ? 'up' : 'down'}`;
      breakdownChangeEl.textContent = `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs ${monthLabel(prevMonthKey(selectedMonth))}`;
    }

    if (!monthExpenses.length) {
      breakdownEmptyEl.textContent = 'No transactions this month.';
      breakdownEmptyEl.hidden = false;
      breakdownContentEl.hidden = true;
      return;
    }
    breakdownEmptyEl.hidden = true;
    breakdownContentEl.hidden = false;

    const catTotals = categoryTotals(monthExpenses);
    renderDonut(catTotals, monthTotal);

    const top = [...monthExpenses].sort((a, b) => b.amount - a.amount).slice(0, 5);
    largestTxListEl.innerHTML = top.map((e) => `
      <li class="tx-row">
        <span class="tx-dot" style="background:${categoryColor(e.category)}"></span>
        <span class="tx-desc"><div class="d">${e.description}</div><div class="tx-date">${e.date}</div></span>
        <span class="tx-amount num">₹${e.amount.toFixed(0)}</span>
      </li>`).join('');
  }

  // ---------------- unusual spending insights ----------------
  const insightListEl = document.getElementById('insight-list');
  function renderInsights() {
    const insights = computeInsights(expenses);
    if (!insights.length) {
      insightListEl.innerHTML = '<p class="muted">No unusual patterns detected yet — keep logging to build up history.</p>';
      return;
    }
    insightListEl.innerHTML = insights.map((text) => {
      const isOutlier = text.startsWith('Unusually large');
      return `<div class="insight"><div class="ic ${isOutlier ? 'caution' : 'warn'}">${isOutlier ? '!' : '↑'}</div><p>${text}</p></div>`;
    }).join('');
  }

  // ---------------- recent transactions ----------------
  const recentTxListEl = document.getElementById('recent-tx-list');
  function renderRecent() {
    const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date));
    recentTxListEl.innerHTML = sorted.map((e) => {
      const color = categoryColor(e.category);
      return `<li class="tx-row">
        <span class="tx-dot" style="background:${color}"></span>
        <span class="tx-desc">
          <div class="d-row"><span class="d">${e.description}</span><span class="tag" style="background:color-mix(in srgb, ${color} 16%, white);color:${color};">${e.category}</span></div>
          <div class="tx-date">${e.date}</div>
        </span>
        <span class="tx-amount num">₹${e.amount.toFixed(0)}</span>
        <button class="tx-del" aria-label="Delete transaction" data-id="${e.id}">✕</button>
      </li>`;
    }).join('');
    recentTxListEl.querySelectorAll('.tx-del').forEach((btn) => {
      btn.addEventListener('click', () => deleteExpense(Number(btn.dataset.id)));
    });
  }

  // ---------------- top-level render ----------------
  function render() {
    renderRecent();

    const allMonths = monthlyTotals(expenses);
    if (!allMonths.some(([key]) => key === selectedMonth)) {
      selectedMonth = allMonths.length ? allMonths[allMonths.length - 1][0] : null;
    }
    rangeFilterEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.range === selectedRange));

    const rangedMonths = monthsInRange(allMonths, selectedRange);
    const rangedKeys = new Set(rangedMonths.map(([key]) => key));
    const rangedExpenses = expenses.filter((e) => rangedKeys.has(monthKey(e.date)));

    renderStats(rangedMonths, rangedExpenses);
    renderTrend(rangedMonths);
    renderWave(rangedMonths);
    renderBreakdown();
    renderInsights();
  }

  async function loadExpenses() {
    const res = await fetch(API_BASE);
    if (res.status === 401) return showScreen('signin');
    expenses = await res.json();
    render();
  }

  async function deleteExpense(id) {
    const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    if (res.status === 401) return showScreen('signin');
    expenses = expenses.filter((x) => x.id !== id);
    render();
  }

  checkAuth();
}
