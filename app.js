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

if (typeof module !== 'undefined') {
  module.exports = { categorize, monthKey, mean, computeInsights, categoryTotals, monthlyTotals, monthLabel, CATEGORY_RULES };
}

// ---- DOM wiring (skipped entirely under Node/test) ----
if (typeof document !== 'undefined') {
  const API_BASE = '/api/expenses';
  let expenses = [];
  let selectedMonth = null;

  const form = document.getElementById('expense-form');
  const descInput = document.getElementById('description');
  const amountInput = document.getElementById('amount');
  const dateInput = document.getElementById('date');
  const categorySelect = document.getElementById('category');
  const listEl = document.getElementById('expense-list');
  const totalsEl = document.getElementById('category-totals');
  const insightsEl = document.getElementById('insights');
  const totalEl = document.getElementById('month-total');
  const trendEl = document.getElementById('month-trend');
  const monthCardsEl = document.getElementById('month-cards');
  const breakdownEl = document.getElementById('month-breakdown');

  dateInput.value = new Date().toISOString().slice(0, 10);
  descInput.addEventListener('input', () => {
    categorySelect.value = categorize(descInput.value);
  });

  function render() {
    // Transaction list, newest first
    listEl.innerHTML = '';
    [...expenses].sort((a, b) => b.date.localeCompare(a.date)).forEach((e) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="desc">${e.description}</span><span class="cat">${e.category}</span><span class="amt">₹${e.amount.toFixed(0)}</span><span class="date">${e.date}</span>`;
      const del = document.createElement('button');
      del.textContent = '×';
      del.className = 'delete';
      del.onclick = () => deleteExpense(e.id);
      li.appendChild(del);
      listEl.appendChild(li);
    });

    // Category breakdown bars
    const totals = categoryTotals(expenses);
    const grandTotal = totals.reduce((sum, [, amt]) => sum + amt, 0);
    totalsEl.innerHTML = '';
    for (const [category, amt] of totals) {
      const pct = grandTotal ? (amt / grandTotal) * 100 : 0;
      const row = document.createElement('div');
      row.className = 'cat-row';
      row.innerHTML = `
        <div class="cat-row-label"><span>${category}</span><span>₹${amt.toFixed(0)}</span></div>
        <div class="bar"><div class="bar-fill" style="width:${pct.toFixed(1)}%"></div></div>`;
      totalsEl.appendChild(row);
    }
    totalEl.textContent = `₹${grandTotal.toFixed(0)}`;

    renderMonths();

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

  // Trend chart (oldest -> newest), month cards (newest first), and a
  // category breakdown for whichever month is selected.
  function renderMonths() {
    const totals = monthlyTotals(expenses);
    if (!totals.some(([key]) => key === selectedMonth)) {
      selectedMonth = totals.length ? totals[totals.length - 1][0] : null;
    }

    const maxAmt = Math.max(0, ...totals.map(([, amt]) => amt));
    trendEl.innerHTML = '';
    for (const [key, amt] of totals) {
      const bar = document.createElement('div');
      bar.className = 'trend-bar' + (key === selectedMonth ? ' selected' : '');
      bar.title = `${monthLabel(key)}: ₹${amt.toFixed(0)}`;
      bar.innerHTML = `<div class="trend-bar-fill" style="height:${maxAmt ? (amt / maxAmt) * 100 : 0}%"></div>`;
      bar.onclick = () => selectMonth(key);
      trendEl.appendChild(bar);
    }

    monthCardsEl.innerHTML = '';
    [...totals].reverse().forEach(([key, amt]) => {
      const card = document.createElement('div');
      card.className = 'month-card' + (key === selectedMonth ? ' selected' : '');
      card.innerHTML = `<div class="month-card-label">${monthLabel(key)}</div><div class="month-card-amt">₹${amt.toFixed(0)}</div>`;
      card.onclick = () => selectMonth(key);
      monthCardsEl.appendChild(card);
    });

    breakdownEl.innerHTML = '';
    if (!selectedMonth) {
      breakdownEl.innerHTML = '<p class="muted">Log an expense to see monthly trends.</p>';
      return;
    }
    const monthExpenses = expenses.filter((e) => monthKey(e.date) === selectedMonth);
    const monthTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
    const title = document.createElement('div');
    title.className = 'breakdown-title';
    title.textContent = `${monthLabel(selectedMonth)} — ₹${monthTotal.toFixed(0)} across ${monthExpenses.length} transaction${monthExpenses.length === 1 ? '' : 's'}`;
    breakdownEl.appendChild(title);
    for (const [category, amt] of categoryTotals(monthExpenses)) {
      const pct = monthTotal ? (amt / monthTotal) * 100 : 0;
      const row = document.createElement('div');
      row.className = 'cat-row';
      row.innerHTML = `
        <div class="cat-row-label"><span>${category}</span><span>₹${amt.toFixed(0)}</span></div>
        <div class="bar"><div class="bar-fill" style="width:${pct.toFixed(1)}%"></div></div>`;
      breakdownEl.appendChild(row);
    }
  }

  async function loadExpenses() {
    const res = await fetch(API_BASE);
    expenses = await res.json();
    render();
  }

  async function deleteExpense(id) {
    await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    expenses = expenses.filter((x) => x.id !== id);
    render();
  }

  form.addEventListener('submit', async (ev) => {
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
    const created = await res.json();
    expenses.push(created);
    form.reset();
    dateInput.value = new Date().toISOString().slice(0, 10);
    categorySelect.value = 'Food & Dining';
    render();
  });

  loadExpenses();
}
