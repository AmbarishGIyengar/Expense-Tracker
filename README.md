# Expense Tracker

A personal expense tracker: log a spend, it auto-categorizes itself from the
description, and a dashboard surfaces monthly trends and unusual spending
patterns.

## Stack

- **Backend:** FastAPI + SQLModel over SQLite (`backend/`)
- **Frontend:** plain HTML/CSS/JS, no build step (`index.html`, `app.js`) —
  served directly by the FastAPI app, so there's no CORS setup to worry about

## Features

- Add an expense (description, amount, date); category is auto-suggested
  from keywords in the description and editable before saving
- Monthly spending dashboard — a trend chart and month cards; click a month
  to see its category breakdown
- Category breakdown with proportional bars
- Unusual spending insights: categories trending above their historical
  average, and single transactions that are outliers for their category

## Setup

Requires Python 3.11+ and Node (for running the frontend's test suite).

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Running

```bash
source .venv/bin/activate
uvicorn backend.main:app --reload
```

Open http://localhost:8000 — the frontend is served from the same app, API
routes live under `/api`. Data persists to `expense_tracker.db` (SQLite,
gitignored, created automatically on first run).

## Tests

```bash
# backend
source .venv/bin/activate
python3 -m backend.test_main

# frontend
node test_app.js
```

## Project structure

```
backend/
  main.py        FastAPI app: API routes + serves the frontend
  models.py      SQLModel Expense table
  database.py    SQLite engine/session
  test_main.py   backend self-check
index.html        page markup/styles
app.js            categorization, insights, dashboard rendering, API calls
test_app.js       frontend self-check (pure functions)
```
