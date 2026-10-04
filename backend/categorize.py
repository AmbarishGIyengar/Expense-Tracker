# Mirrors CATEGORY_RULES in app.js. Keep the two in sync by hand — manual
# entries are categorized client-side, imported statement rows server-side.
CATEGORY_RULES = [
    ('Food & Dining', ['food', 'lunch', 'dinner', 'breakfast', 'restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'swiggy', 'zomato', 'snack', 'canteen', 'mess', 'tea']),
    ('Groceries', ['grocery', 'groceries', 'supermarket', 'vegetable', 'kirana', 'bigbasket']),
    ('Transport', ['uber', 'ola', 'taxi', 'bus', 'train', 'metro', 'fuel', 'petrol', 'diesel', 'cab', 'auto', 'fare', 'rapido']),
    ('Housing', ['rent', 'hostel', 'pg ', 'maintenance', 'electricity', 'wifi', 'broadband']),
    ('Education', ['book', 'tuition', 'course', 'fees', 'fee', 'stationery', 'exam', 'library', 'udemy', 'coursera']),
    ('Entertainment', ['movie', 'netflix', 'spotify', 'prime video', 'game', 'concert', 'party', 'outing', 'bookmyshow']),
    ('Subscriptions', ['subscription', 'membership']),
    ('Shopping', ['amazon', 'flipkart', 'clothes', 'shoes', 'myntra', 'mall', 'shopping']),
    ('Health', ['medicine', 'doctor', 'hospital', 'pharmacy', 'gym']),
    ('Utilities', ['recharge', 'mobile bill', 'phone bill', 'water bill']),
]


def categorize(description: str) -> str:
    text = (description or '').lower()
    for category, keywords in CATEGORY_RULES:
        if any(kw in text for kw in keywords):
            return category
    return 'Other'
