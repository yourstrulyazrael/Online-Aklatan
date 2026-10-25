"""Demo activity for the analytics: sample shoppers, reviews and 90 days of orders.

Run through `python migrate.py --seed`. Does nothing if the database already has orders.
"""
import random
import secrets
from datetime import datetime, timedelta
from decimal import Decimal

from werkzeug.security import generate_password_hash

from config import Config
from database import connect

SAMPLE_NAMES = ["Andrea Cruz", "Miguel Santos", "Bea Reyes", "Paolo Garcia", "Kim Villanueva",
                "Carlo Mendoza", "Jasmine Tan", "Rafael Bautista", "Nicole Lim", "Joshua Ramos"]
SAMPLE_REVIEWS = [
    (5, "Couldn't put it down. An instant favorite."),
    (4, "Really enjoyed it — a few slow chapters but worth it."),
    (5, "Beautifully written. Already recommended it to friends."),
    (3, "Good, but didn't quite live up to the hype for me."),
    (4, "Solid read, arrived in great condition."),
]
CITIES = ["Cabanatuan", "Manila", "Quezon City", "Iloilo", "Cebu", "Davao"]
PROVIDERS = {"cash": ["Cash on Delivery"], "ewallet": ["GCash", "Maya", "GrabPay"], "card": ["Visa", "Mastercard"]}


def run():
    conn = connect()
    cur = conn.cursor(dictionary=True)
    cur.execute("SELECT COUNT(*) AS n FROM orders")
    if cur.fetchone()["n"]:
        print("Demo data skipped: the database already has orders.")
        conn.close()
        return
    cur.execute("SELECT id, title, price FROM books WHERE is_active = 1")
    books = cur.fetchall()
    if not books:
        print("Demo data skipped: no books yet (run the migrations first).")
        conn.close()
        return

    rnd = random.Random(20261025)
    now = datetime.now()

    # Sample shoppers get random passwords: they exist for the order history, not for logging in.
    customers = []
    for name in SAMPLE_NAMES:
        email = name.lower().replace(" ", ".") + "@mail.com"
        cur.execute("INSERT IGNORE INTO users (name, email, password_hash) VALUES (%s, %s, %s)",
                    (name, email, generate_password_hash(secrets.token_urlsafe(12))))
        cur.execute("SELECT id, name, email FROM users WHERE email = %s", (email,))
        customers.append(cur.fetchone())

    for b in books:
        cur.execute("UPDATE books SET views = %s WHERE id = %s", (80 + rnd.randrange(900), b["id"]))
        for _ in range(1 + rnd.randrange(4)):
            rating, text = rnd.choice(SAMPLE_REVIEWS)
            cur.execute("INSERT INTO reviews (book_id, user_id, rating, text, created_at) VALUES (%s, %s, %s, %s, %s)",
                        (b["id"], rnd.choice(customers)["id"], rating, text, now - timedelta(days=rnd.randrange(90))))

    count = 0
    for d in range(89, -1, -1):
        for _ in range(rnd.randrange(4) + (1 if d < 30 else 0)):
            lines = [(b, 1 + rnd.randrange(2)) for b in rnd.sample(books, 1 + rnd.randrange(3))]
            subtotal = sum((b["price"] * q for b, q in lines), Decimal("0"))
            shipping = Decimal("0") if subtotal >= Config.FREE_SHIPPING_MIN else Decimal(Config.SHIPPING_FEE)
            method = rnd.choice(list(PROVIDERS))
            created = now - timedelta(days=d, seconds=rnd.randrange(int(86400 * 0.8)))
            age = (now - created).days
            status = "Delivered" if age > 7 else "Shipped" if age > 3 else "Processing" if age > 1 else "Pending"
            if rnd.random() < 0.04:
                status = "Cancelled"
            c = rnd.choice(customers)
            order_id = "BK" + format(int(created.timestamp() * 1000), "X") + secrets.token_hex(1).upper()
            cur.execute(
                """INSERT INTO orders (id, user_id, customer_name, email, phone, address, city, subtotal, discount,
                                       shipping, total, payment_method, payment_provider, payment_last4, status, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 0, %s, %s, %s, %s, %s, %s, %s)""",
                (order_id, c["id"], c["name"], c["email"], "09" + str(rnd.randrange(10**9)).zfill(9), "123 Sample St.",
                 rnd.choice(CITIES), subtotal, shipping, subtotal + shipping, method, rnd.choice(PROVIDERS[method]),
                 str(1000 + rnd.randrange(9000)) if method == "card" else None, status, created))
            cur.executemany("INSERT INTO order_items (order_id, book_id, title, price, qty) VALUES (%s, %s, %s, %s, %s)",
                            [(order_id, b["id"], b["title"], b["price"], q) for b, q in lines])
            count += 1
    conn.commit()
    conn.close()
    print(f"Demo data added: {len(customers)} shoppers, reviews, and {count} orders over 90 days.")


if __name__ == "__main__":
    run()
