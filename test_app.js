const assert = require('assert');
const {
  categorize, computeInsights, categoryTotals, monthlyTotals, monthLabel,
  prevMonthKey, percentChange, monthsInRange, categoryColor,
} = require('./app.js');

assert.strictEqual(categorize('Swiggy dinner'), 'Food & Dining');
assert.strictEqual(categorize('Uber to campus'), 'Transport');
assert.strictEqual(categorize('Netflix subscription'), 'Entertainment');
assert.strictEqual(categorize('Random stuff'), 'Other');

const totals = categoryTotals([
  { category: 'Food & Dining', amount: 100 },
  { category: 'Transport', amount: 50 },
  { category: 'Food & Dining', amount: 20 },
]);
assert.deepStrictEqual(totals, [['Food & Dining', 120], ['Transport', 50]]);

// Spike: Food spend triples in the current month vs. a steady prior month.
const spikeExpenses = [
  { description: 'lunch', amount: 100, category: 'Food & Dining', date: '2026-08-05' },
  { description: 'lunch', amount: 100, category: 'Food & Dining', date: '2026-09-05' },
  { description: 'big party dinner', amount: 400, category: 'Food & Dining', date: '2026-10-01' },
  { description: 'lunch', amount: 100, category: 'Food & Dining', date: '2026-10-05' },
];
const insights = computeInsights(spikeExpenses);
assert.ok(insights.some((i) => i.includes('Food & Dining spending is up')));

// Not enough history yet -> no false positives.
assert.deepStrictEqual(computeInsights([{ description: 'coffee', amount: 50, category: 'Food & Dining', date: '2026-10-01' }]), []);

assert.deepStrictEqual(
  monthlyTotals([
    { date: '2026-09-05', amount: 50 },
    { date: '2026-10-01', amount: 100 },
    { date: '2026-09-20', amount: 30 },
  ]),
  [['2026-09', 80], ['2026-10', 100]],
);
assert.strictEqual(monthLabel('2026-10'), 'Oct 2026');

assert.strictEqual(prevMonthKey('2026-10'), '2026-09');
assert.strictEqual(prevMonthKey('2026-01'), '2025-12'); // year rollover

assert.strictEqual(percentChange(150, 100), 50);
assert.strictEqual(percentChange(50, 100), -50);
assert.strictEqual(percentChange(100, 0), null); // nothing to compare against

const sixMonths = [['2026-05', 1], ['2026-06', 2], ['2026-07', 3], ['2026-08', 4], ['2026-09', 5], ['2026-10', 6]];
assert.deepStrictEqual(monthsInRange(sixMonths, '3'), [['2026-08', 4], ['2026-09', 5], ['2026-10', 6]]);
assert.deepStrictEqual(monthsInRange(sixMonths, 'all'), sixMonths);

assert.strictEqual(categoryColor('Food & Dining'), '#38bdf8');
assert.strictEqual(categoryColor('Something unknown'), '#64748b'); // fallback for unmapped categories

console.log('all app.js self-checks passed');
