"""MySQL access with plain SQL (mysql-connector-python). One pooled connection per request."""
import secrets
from datetime import datetime

import mysql.connector
from flask import g
from mysql.connector import pooling

from config import DB_CONFIG

_pool = None


def connect(**overrides):
    """A standalone connection (used by migrate.py and seed_demo.py)."""
    return mysql.connector.connect(**{**DB_CONFIG, **overrides}, charset="utf8mb4", collation="utf8mb4_unicode_ci")


def get_db():
    """The current request's connection, borrowed from the pool on first use."""
    global _pool
    if "db" not in g:
        if _pool is None:
            _pool = pooling.MySQLConnectionPool(pool_name="bookstore", pool_size=10, pool_reset_session=True,
                                                charset="utf8mb4", collation="utf8mb4_unicode_ci", **DB_CONFIG)
        g.db = _pool.get_connection()
    return g.db


def close_db(_exc=None):
    conn = g.pop("db", None)
    if conn is not None:
        # Roll back anything left uncommitted (e.g. after an error) before returning it to the pool.
        try:
            conn.rollback()
        finally:
            conn.close()


def init_app(app):
    app.teardown_appcontext(close_db)


def query(sql, params=(), one=False):
    """Run a SELECT and return dict rows (or a single row / None with one=True)."""
    cur = get_db().cursor(dictionary=True)
    try:
        cur.execute(sql, params)
        rows = cur.fetchall()
    finally:
        cur.close()
    return (rows[0] if rows else None) if one else rows


def execute(sql, params=()):
    """Run an INSERT/UPDATE/DELETE inside the request's transaction. Returns (lastrowid, rowcount)."""
    cur = get_db().cursor()
    try:
        cur.execute(sql, params)
        return cur.lastrowid, cur.rowcount
    finally:
        cur.close()


def executemany(sql, rows):
    cur = get_db().cursor()
    try:
        cur.executemany(sql, rows)
    finally:
        cur.close()


def commit():
    get_db().commit()


def placeholders(values):
    """'%s, %s, %s' for an IN (...) clause."""
    return ", ".join(["%s"] * len(values))


def new_order_id():
    stamp = int(datetime.now().timestamp() * 1000)
    digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    out = ""
    while stamp:
        stamp, r = divmod(stamp, 36)
        out = digits[r] + out
    return "BK" + out + secrets.token_hex(2).upper()


# ---------------------------------------------------------------- row -> JSON

def ms(dt):
    """Datetime -> epoch milliseconds, the format the front-end uses."""
    return int(dt.timestamp() * 1000) if dt else None


def money(value):
    return float(value or 0)


def user_json(u):
    return {"id": u["id"], "name": u["name"], "email": u["email"], "role": u["role"]}


def book_json(b, stats=None):
    stats = stats or {}
    return {
        "id": b["id"], "title": b["title"], "author": b["author"], "genre": b["genre"],
        "isbn": b["isbn"] or "", "price": money(b["price"]), "stock": b["stock"],
        "year": b["year"], "pages": b["pages"], "description": b["description"] or "",
        "coverUrl": b["cover_url"] or "", "cover": [b["color1"], b["color2"]],
        "views": b["views"], "createdAt": ms(b["created_at"]),
        "rating": stats.get("rating", {"avg": 0, "count": 0}),
        "sold": stats.get("sold", 0), "revenue": stats.get("revenue", 0),
        "wished": stats.get("wished", False),
    }


def order_json(o, items):
    return {
        "id": o["id"], "userEmail": o["email"],
        "customer": {"name": o["customer_name"], "email": o["email"], "phone": o["phone"],
                     "address": o["address"], "city": o["city"], "notes": o["notes"] or ""},
        "items": [{"bookId": i["book_id"], "title": i["title"], "price": money(i["price"]), "qty": i["qty"]} for i in items],
        "subtotal": money(o["subtotal"]), "discount": money(o["discount"]),
        "shipping": money(o["shipping"]), "total": money(o["total"]), "promoCode": o["promo_code"] or "",
        "payment": {"method": o["payment_method"], "provider": o["payment_provider"],
                    "last4": o["payment_last4"] or "", "account": o["payment_account"] or "",
                    "ref": o["payment_ref"] or "", "changeFor": money(o["change_for"])},
        "status": o["status"], "createdAt": ms(o["created_at"]),
    }


def orders_with_items(where="", params=()):
    """Orders (newest first) with their line items, as JSON-ready dicts."""
    orders = query(f"SELECT * FROM orders {where} ORDER BY created_at DESC", params)
    if not orders:
        return []
    ids = [o["id"] for o in orders]
    items = {}
    for i in query(f"SELECT * FROM order_items WHERE order_id IN ({placeholders(ids)}) ORDER BY id", ids):
        items.setdefault(i["order_id"], []).append(i)
    return [order_json(o, items.get(o["id"], [])) for o in orders]


def book_stats(user_id=None, book_ids=None):
    """Ratings, units sold, revenue and wishlist flags keyed by book id."""
    stats = {}

    def entry(bid):
        return stats.setdefault(bid, {"rating": {"avg": 0, "count": 0}, "sold": 0, "revenue": 0, "wished": False})

    ids = list(book_ids or [])
    in_books = f"AND {{col}} IN ({placeholders(ids)})" if ids else ""

    for r in query(f"""SELECT book_id, AVG(rating) AS avg, COUNT(*) AS cnt FROM reviews
                       WHERE 1=1 {in_books.format(col='book_id')} GROUP BY book_id""", ids):
        entry(r["book_id"])["rating"] = {"avg": float(r["avg"] or 0), "count": r["cnt"]}

    for r in query(f"""SELECT oi.book_id, SUM(oi.qty) AS sold, SUM(oi.qty * oi.price) AS revenue
                       FROM order_items oi JOIN orders o ON o.id = oi.order_id
                       WHERE o.status <> 'Cancelled' {in_books.format(col='oi.book_id')}
                       GROUP BY oi.book_id""", ids):
        entry(r["book_id"])["sold"] = int(r["sold"] or 0)
        entry(r["book_id"])["revenue"] = money(r["revenue"])

    if user_id:
        for r in query("SELECT book_id FROM wishlist_items WHERE user_id = %s", (user_id,)):
            entry(r["book_id"])["wished"] = True
    return stats
