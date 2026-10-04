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
  'Food & Dining': '#38bdf8', 'Groceries': '#34d399', 'Transport': '#fbbf24',
  'Housing': '#f472b6', 'Education': '#a78bfa', 'Entertainment': '#fb923c',
  'Subscriptions': '#22d3ee', 'Shopping': '#f87171', 'Health': '#4ade80',
  'Utilities': '#facc15', 'Other': '#94a3b8',
};
function categoryColor(category) {
  return CATEGORY_COLORS[category] || '#64748b';
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
  const RANGES = [
    { key: '3', label: '3M' }, { key: '6', label: '6M' },
    { key: '12', label: '12M' }, { key: 'all', label: 'All time' },
  ];
  let expenses = [];
  let selectedMonth = null;
  let selectedRange = 'all';

  const appErrorEl = document.getElementById('app-error');
  const logoutBtn = document.getElementById('logout-btn');
  const form = document.getElementById('expense-form');
  const descInput = document.getElementById('description');
  const amountInput = document.getElementById('amount');
  const dateInput = document.getElementById('date');
  const categorySelect = document.getElementById('category');
  const listEl = document.getElementById('expense-list');
  const insightsEl = document.getElementById('insights');
  const rangeRowEl = document.getElementById('range-row');
  const statGridEl = document.getElementById('stat-grid');
  const trendEl = document.getElementById('month-trend');
  const monthCardsEl = document.getElementById('month-cards');
  const breakdownEl = document.getElementById('month-breakdown');
  const importForm = document.getElementById('import-form');
  const importFileInput = document.getElementById('import-file');
  const importStatusEl = document.getElementById('import-status');

  dateInput.value = new Date().toISOString().slice(0, 10);
  descInput.addEventListener('input', () => {
    categorySelect.value = categorize(descInput.value);
  });

  function render() {
    // Transaction list, newest first
    listEl.innerHTML = '';
    [...expenses].sort((a, b) => b.date.localeCompare(a.date)).forEach((e) => {
      const li = document.createElement('li');
      const desc = document.createElement('span');
      desc.className = 'desc';
      desc.textContent = e.description; // textContent, not innerHTML: descriptions are user-entered
      const cat = document.createElement('span');
      cat.className = 'cat';
      cat.textContent = e.category;
      const amt = document.createElement('span');
      amt.className = 'amt';
      amt.textContent = `₹${e.amount.toFixed(0)}`;
      const dt = document.createElement('span');
      dt.className = 'date';
      dt.textContent = e.date;
      li.append(desc, cat, amt, dt);
      const del = document.createElement('button');
      del.textContent = '×';
      del.className = 'delete';
      del.onclick = () => deleteExpense(e.id);
      li.appendChild(del);
      listEl.appendChild(li);
    });

    renderDashboard();

    // Insights
    const insights = computeInsights(expenses);
    insightsEl.innerHTML = '';
    if (!insights.length) {
      insightsEl.innerHTML = '<li class="muted">No unusual patterns detected yet — keep logging to build up history.</li>';
    } else {
      for (const text of insights) {
        const li = document.createElement('li');
        li.textContent = text;
        insightsEl.appendChild(li);
      }
    }
  }

  function selectMonth(key) {
    selectedMonth = key;
    render();
  }

  function selectRange(key) {
    selectedRange = key;
    render();
  }

  function renderDashboard() {
    const allMonths = monthlyTotals(expenses); // chronological
    if (!allMonths.some(([key]) => key === selectedMonth)) {
      selectedMonth = allMonths.length ? allMonths[allMonths.length - 1][0] : null;
    }

    const rangedMonths = monthsInRange(allMonths, selectedRange);
    const rangedKeys = new Set(rangedMonths.map(([key]) => key));
    const rangedExpenses = expenses.filter((e) => rangedKeys.has(monthKey(e.date)));

    renderRangeButtons();
    renderStats(rangedMonths, rangedExpenses);
    renderTrend(rangedMonths);
    renderMonthCards(rangedMonths);
    renderBreakdown();
  }

  function renderRangeButtons() {
    rangeRowEl.innerHTML = '';
    for (const r of RANGES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = r.label;
      btn.className = 'range-btn' + (r.key === selectedRange ? ' active' : '');
      btn.onclick = () => selectRange(r.key);
      rangeRowEl.appendChild(btn);
    }
  }

  function renderStats(rangedMonths, rangedExpenses) {
    const total = rangedExpenses.reduce((sum, e) => sum + e.amount, 0);
    const avg = rangedMonths.length ? total / rangedMonths.length : 0;
    const topCategory = categoryTotals(rangedExpenses)[0];
    const stats = [
      ['Total spent', `₹${total.toFixed(0)}`],
      ['Monthly average', `₹${avg.toFixed(0)}`],
      ['Top category', topCategory ? topCategory[0] : '—'],
      ['Transactions', String(rangedExpenses.length)],
    ];
    statGridEl.innerHTML = stats.map(([label, value]) => `
      <div class="stat-tile">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${value}</div>
      </div>`).join('');
  }

  // Line + area chart over the ranged months. viewBox is a fixed nominal
  // size; vector-effect: non-scaling-stroke (CSS) keeps lines crisp as the
  // SVG scales to its container, so no resize-handling JS is needed.
  function renderTrend(months) {
    if (!months.length) {
      trendEl.innerHTML = '<p class="muted">Log an expense to see your trend.</p>';
      return;
    }
    const W = 600, H = 140, PAD = 20;
    const maxAmt = Math.max(...months.map(([, amt]) => amt), 1);
    const stepX = months.length > 1 ? (W - PAD * 2) / (months.length - 1) : 0;
    const points = months.map(([key, amt], i) => ({
      key, amt,
      x: PAD + i * stepX,
      y: H - PAD - (amt / maxAmt) * (H - PAD * 2),
    }));

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const last = points[points.length - 1];
    const areaPath = `${linePath} L${last.x.toFixed(1)},${H - PAD} L${points[0].x.toFixed(1)},${H - PAD} Z`;
    const dots = points.map((p) => `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.key === selectedMonth ? 5 : 3.5}"
        class="trend-dot${p.key === selectedMonth ? ' selected' : ''}" data-key="${p.key}">
        <title>${monthLabel(p.key)}: ₹${p.amt.toFixed(0)}</title>
      </circle>`).join('');
    const mid = points[Math.floor((points.length - 1) / 2)];

    trendEl.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" class="trend-svg-el">
        <path d="${areaPath}" class="trend-area"></path>
        <path d="${linePath}" class="trend-line"></path>
        ${dots}
      </svg>
      <div class="trend-labels">
        <span>${monthLabel(points[0].key)}</span>
        ${points.length > 2 ? `<span>${monthLabel(mid.key)}</span>` : ''}
        <span>${monthLabel(last.key)}</span>
      </div>`;
    trendEl.querySelectorAll('circle').forEach((c) => c.addEventListener('click', () => selectMonth(c.dataset.key)));
  }

  function renderMonthCards(months) {
    monthCardsEl.innerHTML = '';
    [...months].reverse().forEach(([key, amt]) => {
      const card = document.createElement('div');
      card.className = 'month-card' + (key === selectedMonth ? ' selected' : '');
      card.innerHTML = `<div class="month-card-label">${monthLabel(key)}</div><div class="month-card-amt">₹${amt.toFixed(0)}</div>`;
      card.onclick = () => selectMonth(key);
      monthCardsEl.appendChild(card);
    });
  }

  function donutGradient(catTotals, total) {
    let acc = 0;
    const stops = catTotals.map(([category, amt]) => {
      const start = (acc / total) * 100;
      acc += amt;
      return `${categoryColor(category)} ${start.toFixed(2)}% ${((acc / total) * 100).toFixed(2)}%`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }

  function renderBreakdown() {
    if (!selectedMonth) {
      breakdownEl.innerHTML = '<p class="muted">Log an expense to see a monthly breakdown.</p>';
      return;
    }
    const monthExpenses = expenses.filter((e) => monthKey(e.date) === selectedMonth);
    const monthTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
    const prevEntry = monthlyTotals(expenses).find(([key]) => key === prevMonthKey(selectedMonth));
    const delta = percentChange(monthTotal, prevEntry ? prevEntry[1] : 0);
    const deltaHtml = delta === null ? '' : `
      <span class="delta ${delta > 0 ? 'up' : 'down'}">
        ${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs ${monthLabel(prevMonthKey(selectedMonth))}
      </span>`;

    let html = `
      <div class="breakdown-header">
        <div class="breakdown-title">${monthLabel(selectedMonth)} — ₹${monthTotal.toFixed(0)} across ${monthExpenses.length} transaction${monthExpenses.length === 1 ? '' : 's'}</div>
        ${deltaHtml}
      </div>`;

    if (monthExpenses.length) {
      const catTotals = categoryTotals(monthExpenses);
      html += `
        <div class="donut-wrap">
          <div class="donut" style="background:${donutGradient(catTotals, monthTotal)}">
            <div class="donut-center"><span>₹${monthTotal.toFixed(0)}</span></div>
          </div>
          <div class="legend">
            ${catTotals.map(([category, amt]) => `
              <div class="legend-row">
                <span class="legend-swatch" style="background:${categoryColor(category)}"></span>
                <span class="legend-label">${category}</span>
                <span class="legend-amt">₹${amt.toFixed(0)} · ${((amt / monthTotal) * 100).toFixed(0)}%</span>
              </div>`).join('')}
          </div>
        </div>`;

      html += `<div class="breakdown-subtitle">Largest transactions</div>`;
    }

    breakdownEl.innerHTML = html;

    if (monthExpenses.length) {
      const top = [...monthExpenses].sort((a, b) => b.amount - a.amount).slice(0, 5);
      for (const e of top) {
        const row = document.createElement('div');
        row.className = 'top-tx-row';
        const desc = document.createElement('span');
        desc.textContent = e.description; // user-entered — keep out of innerHTML
        const amt = document.createElement('span');
        amt.textContent = `₹${e.amount.toFixed(0)}`;
        row.append(desc, amt);
        breakdownEl.appendChild(row);
      }
    }
  }

  function showError(message) {
    appErrorEl.textContent = message;
    appErrorEl.classList.add('visible');
  }

  function clearError() {
    appErrorEl.classList.remove('visible');
  }

  function showSkeleton() {
    statGridEl.innerHTML = Array(4).fill('<div class="stat-tile skeleton skeleton-tile"></div>').join('');
    trendEl.innerHTML = '<div class="skeleton" style="height:130px"></div>';
    listEl.innerHTML = Array(3).fill('<li><span class="skeleton skeleton-line" style="width:100%"></span></li>').join('');
  }

  // Wraps a fetch so network/server failures surface as a banner instead of
  // a silently blank page; redirects to the login page on a dropped session.
  async function apiFetch(url, options) {
    let res;
    try {
      res = await fetch(url, options);
    } catch {
      throw new Error("Can't reach the server — check your connection and try again.");
    }
    if (res.status === 401) {
      window.location.href = '/login.html';
      throw new Error('Session expired');
    }
    return res;
  }

  async function loadExpenses() {
    showSkeleton();
    try {
      const res = await apiFetch(API_BASE);
      if (!res.ok) throw new Error('Could not load your expenses. Try refreshing.');
      expenses = await res.json();
      clearError();
      render();
    } catch (err) {
      showError(err.message);
    }
  }

  async function deleteExpense(id) {
    try {
      const res = await apiFetch(`${API_BASE}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Could not delete that expense.');
      expenses = expenses.filter((x) => x.id !== id);
      render();
    } catch (err) {
      showError(err.message);
    }
  }

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const amount = parseFloat(amountInput.value);
    if (!amount || amount <= 0) return;
    try {
      const res = await apiFetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: descInput.value.trim() || '(no description)',
          amount,
          category: categorySelect.value || categorize(descInput.value),
          date: dateInput.value,
        }),
      });
      if (!res.ok) throw new Error('Could not save that expense. Try again.');
      const created = await res.json();
      expenses.push(created);
      clearError();
      form.reset();
      dateInput.value = new Date().toISOString().slice(0, 10);
      categorySelect.value = 'Food & Dining';
      render();
    } catch (err) {
      showError(err.message);
    }
  });

  const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

  importForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const file = importFileInput.files[0];
    if (!file) return;
    if (!/\.(csv|pdf)$/i.test(file.name)) {
      importStatusEl.textContent = 'Only .csv and .pdf files are supported.';
      importStatusEl.classList.add('error');
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      importStatusEl.textContent = 'File is too large (max 5 MB).';
      importStatusEl.classList.add('error');
      return;
    }
    importStatusEl.textContent = 'Importing…';
    importStatusEl.classList.remove('error');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await apiFetch(`${API_BASE}/import`, { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Import failed');
      importStatusEl.textContent = `Imported ${data.imported} of ${data.total_rows} transactions` +
        (data.skipped_duplicates ? ` (${data.skipped_duplicates} already in your tracker).` : '.');
      importForm.reset();
      await loadExpenses();
    } catch (err) {
      importStatusEl.textContent = err.message;
      importStatusEl.classList.add('error');
    }
  });

  loadExpenses();
}
