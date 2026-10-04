import csv
import io
from datetime import date, datetime

import pdfplumber

from .categorize import category_from_tag

DATE_KEYS = {'date', 'txn date', 'transaction date', 'value date'}
DESC_KEYS = {'description', 'narration', 'particulars', 'details', 'transaction details'}
AMOUNT_KEYS = {'amount'}
DEBIT_KEYS = {'debit', 'withdrawal', 'withdrawal amt.', 'withdrawal amt', 'dr'}
TAG_KEYS = {'tags', 'tag', 'category'}

DATE_FORMATS = ['%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%d %b %Y', '%m/%d/%Y']


class StatementFormatError(ValueError):
    """Raised when a table/CSV doesn't look like a bank statement we recognize."""


def _find_col(headers, candidates):
    for h in headers:
        if (h or '').strip().lower() in candidates:
            return h
    return None


def _normalize_date(raw):
    if isinstance(raw, datetime):
        return raw.date().isoformat()
    if isinstance(raw, date):
        return raw.isoformat()
    raw = (raw or '').strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _parse_amount(raw):
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)
    s = str(raw).strip().replace(',', '').replace('₹', '').replace('Rs.', '').replace('Rs', '').strip()
    if not s:
        return None
    negative = s.startswith('(') and s.endswith(')')
    if negative:
        s = s[1:-1]
    try:
        val = float(s)
    except ValueError:
        return None
    return -val if negative else val


# ponytail: handles the two common bank-export conventions (one signed
# "Amount" column, or separate Debit/Credit columns) via a fixed set of
# header aliases. Real statements vary a lot — add aliases as imports fail
# rather than trying to guess every bank's format up front.
def parse_rows(rows):
    if not rows:
        return []
    headers = list(rows[0].keys())
    date_col = _find_col(headers, DATE_KEYS)
    desc_col = _find_col(headers, DESC_KEYS)
    amount_col = _find_col(headers, AMOUNT_KEYS)
    debit_col = _find_col(headers, DEBIT_KEYS)
    tag_col = _find_col(headers, TAG_KEYS)

    if not date_col or not desc_col or not (amount_col or debit_col):
        raise StatementFormatError('Could not find date/description/amount columns')

    parsed = []
    for row in rows:
        date_str = _normalize_date(row.get(date_col))
        description = (row.get(desc_col) or '').strip()
        if not date_str or not description:
            continue

        if amount_col:
            val = _parse_amount(row.get(amount_col))
            if val is None or val >= 0:
                continue  # blank, or a credit/deposit — not a spend
            amount = -val
        else:
            val = _parse_amount(row.get(debit_col))
            if val is None or val <= 0:
                continue  # blank debit cell means this row was a credit
            amount = val

        row_out = {'date': date_str, 'description': description, 'amount': amount}
        if tag_col:
            category = category_from_tag(row.get(tag_col))
            if category:
                row_out['category'] = category
        parsed.append(row_out)
    return parsed


def parse_csv(file_bytes: bytes):
    text = file_bytes.decode('utf-8-sig', errors='ignore')
    rows = list(csv.DictReader(io.StringIO(text)))
    return parse_rows(rows)


def parse_xlsx(file_bytes: bytes):
    import openpyxl  # imported lazily: only needed for this one format

    parsed = []
    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True, read_only=True)
    for ws in wb.worksheets:
        rows_iter = ws.iter_rows(values_only=True)
        headers = next(rows_iter, None)
        if not headers:
            continue
        headers = [str(h) if h is not None else '' for h in headers]
        rows = [dict(zip(headers, raw_row)) for raw_row in rows_iter]
        try:
            parsed.extend(parse_rows(rows))
        except StatementFormatError:
            continue  # not every sheet (e.g. a summary tab) is the transactions table
    return parsed


def parse_pdf(file_bytes: bytes):
    parsed = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                if not table or len(table) < 2:
                    continue
                headers = [h or '' for h in table[0]]
                rows = [dict(zip(headers, raw_row)) for raw_row in table[1:]]
                try:
                    parsed.extend(parse_rows(rows))
                except StatementFormatError:
                    continue  # not every table on the page is the transactions table
    return parsed
