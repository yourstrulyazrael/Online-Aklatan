"""JSON API used by the front-end (static/js/store.js). Plain SQL against MySQL."""
import io
import re
import secrets
from decimal import Decimal, InvalidOperation
from functools import wraps
from pathlib import Path
from secrets import randbelow

from flask import Blueprint, current_app, jsonify, request, session
from PIL import Image, ImageOps, UnidentifiedImageError
from werkzeug.security import check_password_hash, generate_password_hash

from database import (book_json, book_stats, commit, execute, executemany, new_order_id, orders_with_items,
                      placeholders, query, user_json)

api = Blueprint("api", __name__, url_prefix="/api")

ORDER_STATUSES = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"]
WALLETS = ["GCash", "Maya", "GrabPay"]
CARD_BRANDS = ["Visa", "Mastercard"]
COVER_COLORS = [
    ("#1f3d36", "#3e7a66"), ("#5a1e2b", "#a33a4f"), ("#22314f", "#4a6aa8"), ("#4b3621", "#9c6b3c"),
    ("#3b2a4f", "#7a59a6"), ("#173f4f", "#2f8aa8"), ("#4f2a17", "#c06030"), ("#2d3a1c", "#6b8a3a"),
]
COVER_UPLOAD_URL = "/static/uploads/covers/"
COVER_FORMATS = {"JPEG", "PNG", "WEBP", "GIF"}
COVER_MAX_BYTES = 5 * 1024 * 1024
COVER_MAX_SIZE = (800, 1200)  # px; larger images are scaled down
MOBILE_RE = re.compile(r"^09\d{9}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message, self.status = message, status


@api.errorhandler(ApiError)
def handle_api_error(e):
    return jsonify(error=e.message), e.status


@api.before_request
def require_json_for_writes():
    # Browsers can't send cross-site JSON (or a custom header) without a CORS preflight,
    # so this doubles as CSRF protection. File uploads are multipart and carry the header instead.
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and not (
            request.is_json or request.headers.get("X-Requested-With") == "fetch"):
        raise ApiError("Expected a JSON request.", 415)


def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    return query("SELECT id, name, email, role FROM users WHERE id = %s", (uid,), one=True)


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user():
            raise ApiError("Please sign in to continue.", 401)
        return fn(*args, **kwargs)
    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            raise ApiError("Please sign in to continue.", 401)
        if user["role"] != "admin":
            raise ApiError("Admins only.", 403)
        return fn(*args, **kwargs)
    return wrapper


def body():
    return request.get_json(silent=True) or {}


def active_book(book_id, lock=False):
    sql = "SELECT * FROM books WHERE id = %s AND is_active = 1" + (" FOR UPDATE" if lock else "")
    try:
        book_id = int(book_id)
    except (TypeError, ValueError):
        raise ApiError("Book not found.", 404)
    book = query(sql, (book_id,), one=True)
    if not book:
        raise ApiError("Book not found.", 404)
    return book


def as_int(value, name, minimum=None):
    try:
        n = int(value)
    except (TypeError, ValueError):
        raise ApiError(f"{name} must be a whole number.")
    if minimum is not None and n < minimum:
        raise ApiError(f"{name} must be at least {minimum}.")
    return n


def as_decimal(value, name):
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ApiError(f"{name} must be a number.")


# ---------------------------------------------------------------- auth

@api.get("/me")
def me():
    user = current_user()
    return jsonify(user=user_json(user) if user else None)


@api.post("/login")
def login():
    data = body()
    user = query("SELECT * FROM users WHERE LOWER(email) = LOWER(%s)", (str(data.get("email", "")).strip(),), one=True)
    if not user or not check_password_hash(user["password_hash"], str(data.get("password", ""))):
        raise ApiError("Invalid email or password.", 401)
    session.clear()
    session["user_id"] = user["id"]
    return jsonify(user=user_json(user))


@api.post("/register")
def register():
    data = body()
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip()
    password = str(data.get("password", ""))
    if len(name) < 2:
        raise ApiError("Please enter your full name.")
    if not EMAIL_RE.match(email):
        raise ApiError("Enter a valid email address.")
    if len(password) < 6:
        raise ApiError("Password must be at least 6 characters.")
    if query("SELECT id FROM users WHERE LOWER(email) = LOWER(%s)", (email,), one=True):
        raise ApiError("An account with that email already exists.")
    user_id, _ = execute("INSERT INTO users (name, email, password_hash) VALUES (%s, %s, %s)",
                         (name[:100], email[:120], generate_password_hash(password)))
    commit()
    session.clear()
    session["user_id"] = user_id
    return jsonify(user=user_json(current_user())), 201


@api.post("/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


# ---------------------------------------------------------------- catalog

@api.get("/books")
def list_books():
    user = current_user()
    books = query("SELECT * FROM books WHERE is_active = 1 ORDER BY title")
    stats = book_stats(user["id"] if user else None)
    return jsonify(books=[book_json(b, stats.get(b["id"])) for b in books])


@api.get("/books/<int:book_id>")
def get_book(book_id):
    user = current_user()
    book = active_book(book_id)
    stats = book_stats(user["id"] if user else None, [book_id])
    reviews = query("""SELECT r.id, r.book_id, r.rating, r.text, r.created_at, u.name AS user_name
                       FROM reviews r JOIN users u ON u.id = r.user_id
                       WHERE r.book_id = %s ORDER BY r.created_at DESC""", (book_id,))
    return jsonify(book=book_json(book, stats.get(book_id)), reviews=[
        {"id": r["id"], "bookId": r["book_id"], "user": r["user_name"], "rating": r["rating"],
         "text": r["text"], "date": int(r["created_at"].timestamp() * 1000)} for r in reviews])


@api.post("/books/<int:book_id>/view")
def track_view(book_id):
    execute("UPDATE books SET views = views + 1 WHERE id = %s", (book_id,))
    commit()
    return jsonify(ok=True)


@api.post("/books/<int:book_id>/reviews")
@login_required
def add_review(book_id):
    data = body()
    active_book(book_id)
    rating = as_int(data.get("rating"), "Rating", 1)
    text = str(data.get("text", "")).strip()
    if rating > 5:
        raise ApiError("Rating must be between 1 and 5.")
    if not text:
        raise ApiError("Please write a few words about the book.")
    execute("INSERT INTO reviews (book_id, user_id, rating, text) VALUES (%s, %s, %s, %s)",
            (book_id, current_user()["id"], rating, text[:600]))
    commit()
    return jsonify(ok=True), 201


# ---------------------------------------------------------------- cart

def cart_lines(user_id, lock=False):
    return query(f"""SELECT c.qty AS cart_qty, b.* FROM cart_items c JOIN books b ON b.id = c.book_id
                     WHERE c.user_id = %s AND b.is_active = 1 ORDER BY b.title{" FOR UPDATE" if lock else ""}""",
                 (user_id,))


def quote(lines, promo_code=""):
    cfg = current_app.config
    subtotal = sum((l["price"] * l["cart_qty"] for l in lines), Decimal("0"))
    shipping = Decimal("0") if subtotal == 0 or subtotal >= cfg["FREE_SHIPPING_MIN"] else Decimal(cfg["SHIPPING_FEE"])
    discount = Decimal("0")
    promo = None
    code = (promo_code or "").strip().upper()
    if code:
        p = cfg["PROMOS"].get(code)
        if not p:
            promo = {"code": code, "error": "Invalid promo code."}
        elif p.get("min") and subtotal < p["min"]:
            promo = {"code": code, "error": f"Requires a minimum of ₱{p['min']}."}
        else:
            promo = {"code": code, "label": p["label"]}
            if p["type"] == "percent":
                discount = (subtotal * p["value"] / 100).quantize(Decimal("0.01"))
            elif p["type"] == "flat":
                discount = Decimal(p["value"])
            elif p["type"] == "shipping":
                shipping = Decimal("0")
    total = max(Decimal("0"), subtotal - discount + shipping)
    return {"subtotal": subtotal, "discount": discount, "shipping": shipping, "total": total, "promo": promo}


def cart_count(user_id):
    row = query("SELECT COALESCE(SUM(qty), 0) AS n FROM cart_items WHERE user_id = %s", (user_id,), one=True)
    return int(row["n"])


@api.get("/cart")
@login_required
def get_cart():
    user = current_user()
    lines = cart_lines(user["id"])
    q = quote(lines, request.args.get("promo", ""))
    stats = book_stats(user["id"], [l["id"] for l in lines]) if lines else {}
    return jsonify(
        lines=[{"bookId": l["id"], "qty": l["cart_qty"], "book": book_json(l, stats.get(l["id"]))} for l in lines],
        count=sum(l["cart_qty"] for l in lines),
        subtotal=float(q["subtotal"]), discount=float(q["discount"]), shipping=float(q["shipping"]),
        total=float(q["total"]), promo=q["promo"],
    )


@api.post("/cart")
@login_required
def add_to_cart():
    data = body()
    user = current_user()
    book = active_book(data.get("bookId"))
    qty = as_int(data.get("qty", 1), "Quantity", 1)
    line = query("SELECT qty FROM cart_items WHERE user_id = %s AND book_id = %s", (user["id"], book["id"]), one=True)
    total = (line["qty"] if line else 0) + qty
    if total > book["stock"]:
        raise ApiError("This book is out of stock." if book["stock"] == 0 else f"Only {book['stock']} left in stock.")
    execute("""INSERT INTO cart_items (user_id, book_id, qty) VALUES (%s, %s, %s)
               ON DUPLICATE KEY UPDATE qty = %s""", (user["id"], book["id"], total, total))
    commit()
    return jsonify(count=cart_count(user["id"]))


@api.patch("/cart/<int:book_id>")
@login_required
def set_cart_qty(book_id):
    user = current_user()
    line = query("""SELECT b.stock FROM cart_items c JOIN books b ON b.id = c.book_id
                    WHERE c.user_id = %s AND c.book_id = %s""", (user["id"], book_id), one=True)
    if not line:
        raise ApiError("That book isn't in your cart.", 404)
    qty = min(as_int(body().get("qty"), "Quantity", 1), max(line["stock"], 1))
    execute("UPDATE cart_items SET qty = %s WHERE user_id = %s AND book_id = %s", (qty, user["id"], book_id))
    commit()
    return jsonify(count=cart_count(user["id"]))


@api.delete("/cart/<int:book_id>")
@login_required
def remove_from_cart(book_id):
    user = current_user()
    execute("DELETE FROM cart_items WHERE user_id = %s AND book_id = %s", (user["id"], book_id))
    commit()
    return jsonify(count=cart_count(user["id"]))


# ---------------------------------------------------------------- wishlist

@api.get("/wishlist")
@login_required
def get_wishlist():
    user = current_user()
    books = query("""SELECT b.* FROM wishlist_items w JOIN books b ON b.id = w.book_id
                     WHERE w.user_id = %s AND b.is_active = 1 ORDER BY w.created_at DESC""", (user["id"],))
    stats = book_stats(user["id"], [b["id"] for b in books]) if books else {}
    return jsonify(books=[book_json(b, stats.get(b["id"])) for b in books])


@api.post("/wishlist/<int:book_id>/toggle")
@login_required
def toggle_wishlist(book_id):
    user = current_user()
    active_book(book_id)
    _, removed = execute("DELETE FROM wishlist_items WHERE user_id = %s AND book_id = %s", (user["id"], book_id))
    if not removed:
        execute("INSERT INTO wishlist_items (user_id, book_id) VALUES (%s, %s)", (user["id"], book_id))
    commit()
    return jsonify(wished=not removed)


# ---------------------------------------------------------------- orders

def validate_customer(c):
    name, email = str(c.get("name", "")).strip(), str(c.get("email", "")).strip()
    phone, city = str(c.get("phone", "")).strip(), str(c.get("city", "")).strip()
    address, notes = str(c.get("address", "")).strip(), str(c.get("notes", "")).strip()
    if len(name) < 2:
        raise ApiError("Please enter your full name.")
    if not EMAIL_RE.match(email):
        raise ApiError("Enter a valid email address.")
    if not MOBILE_RE.match(phone):
        raise ApiError("Use an 11-digit mobile number starting with 09.")
    if not city or len(address) < 5:
        raise ApiError("Please complete your delivery address.")
    return {"customer_name": name[:100], "email": email[:120], "phone": phone, "city": city[:80],
            "address": address[:255], "notes": notes[:255] or None}


def validate_payment(p, total):
    """Returns (columns, initial status)."""
    method = p.get("method")
    empty = {"payment_last4": None, "payment_account": None, "payment_ref": None, "change_for": None}
    if method == "cash":
        change_for = as_decimal(p.get("changeFor") or 0, "Change amount")
        if change_for and change_for < total:
            raise ApiError("Change amount must be at least the order total.")
        return {**empty, "payment_method": "cash", "payment_provider": "Cash on Delivery",
                "change_for": change_for or None}, "Pending"
    if method == "ewallet":
        provider, account = p.get("provider"), str(p.get("account", ""))
        if provider not in WALLETS:
            raise ApiError("Choose GCash, Maya or GrabPay.")
        if not MOBILE_RE.match(account):
            raise ApiError(f"Enter your 11-digit {provider} number.")
        return {**empty, "payment_method": "ewallet", "payment_provider": provider,
                "payment_account": account[:4] + "•••" + account[-4:],
                "payment_ref": "REF" + str(randbelow(10**9)).zfill(9)}, "Processing"
    if method == "card":
        # Card numbers are validated in the browser; only the brand and last 4 digits are sent.
        provider, last4 = p.get("provider"), str(p.get("last4", ""))
        if provider not in CARD_BRANDS:
            raise ApiError("We accept Visa and Mastercard only.")
        if not re.fullmatch(r"\d{4}", last4):
            raise ApiError("Invalid card details.")
        return {**empty, "payment_method": "card", "payment_provider": provider, "payment_last4": last4}, "Processing"
    raise ApiError("Choose a payment method.")


@api.post("/orders")
@login_required
def place_order():
    data = body()
    user = current_user()
    # FOR UPDATE locks these book rows until commit, so two shoppers can't buy the last copy.
    lines = cart_lines(user["id"], lock=True)
    if not lines:
        raise ApiError("Your cart is empty.")
    q = quote(lines, data.get("promoCode", ""))
    customer = validate_customer(data.get("customer") or {})
    payment, status = validate_payment(data.get("payment") or {}, q["total"])
    for l in lines:
        if l["cart_qty"] > l["stock"]:
            raise ApiError(f'Only {l["stock"]} of "{l["title"]}" left in stock.', 409)

    order_id = new_order_id()
    promo = q["promo"]
    cols = {"id": order_id, "user_id": user["id"], **customer, "subtotal": q["subtotal"], "discount": q["discount"],
            "shipping": q["shipping"], "total": q["total"],
            "promo_code": promo["code"] if promo and not promo.get("error") else None, **payment, "status": status}
    execute(f"INSERT INTO orders ({', '.join(cols)}) VALUES ({placeholders(cols)})", tuple(cols.values()))
    executemany("INSERT INTO order_items (order_id, book_id, title, price, qty) VALUES (%s, %s, %s, %s, %s)",
                [(order_id, l["id"], l["title"], l["price"], l["cart_qty"]) for l in lines])
    executemany("UPDATE books SET stock = stock - %s WHERE id = %s", [(l["cart_qty"], l["id"]) for l in lines])
    execute("DELETE FROM cart_items WHERE user_id = %s", (user["id"],))
    commit()
    return jsonify(order=orders_with_items("WHERE id = %s", (order_id,))[0]), 201


@api.get("/orders")
@login_required
def my_orders():
    return jsonify(orders=orders_with_items("WHERE user_id = %s", (current_user()["id"],)))


def owned_order(order_id):
    user = current_user()
    rows = orders_with_items("WHERE id = %s", (order_id,))
    order = rows[0] if rows else None
    if not order:
        raise ApiError("Order not found.", 404)
    owner = query("SELECT user_id FROM orders WHERE id = %s", (order_id,), one=True)["user_id"]
    if owner != user["id"] and user["role"] != "admin":
        raise ApiError("Order not found.", 404)
    return order


@api.get("/orders/<order_id>")
@login_required
def get_order(order_id):
    return jsonify(order=owned_order(order_id))


def set_status(order_id, status):
    if status not in ORDER_STATUSES:
        raise ApiError("Unknown status.")
    current = query("SELECT status FROM orders WHERE id = %s FOR UPDATE", (order_id,), one=True)
    if not current:
        raise ApiError("Order not found.", 404)
    if current["status"] == "Cancelled":
        raise ApiError("Cancelled orders can't be changed.")
    if status == "Cancelled":  # return the copies to inventory
        execute("""UPDATE books b JOIN order_items oi ON oi.book_id = b.id
                   SET b.stock = b.stock + oi.qty WHERE oi.order_id = %s""", (order_id,))
    execute("UPDATE orders SET status = %s WHERE id = %s", (status, order_id))
    commit()


@api.post("/orders/<order_id>/cancel")
@login_required
def cancel_order(order_id):
    order = owned_order(order_id)
    if order["status"] not in ("Pending", "Processing"):
        raise ApiError("This order has already shipped.")
    set_status(order_id, "Cancelled")
    return jsonify(order=owned_order(order_id))


# ---------------------------------------------------------------- admin

@api.get("/admin/books")
@admin_required
def admin_books():
    books = query("SELECT * FROM books WHERE is_active = 1 ORDER BY title")
    stats = book_stats()
    return jsonify(books=[book_json(b, stats.get(b["id"])) for b in books])


def book_fields(data, creating):
    title, author = str(data.get("title", "")).strip(), str(data.get("author", "")).strip()
    genre = str(data.get("genre", "")).strip()
    if not title or not author or not genre:
        raise ApiError("Title, author and genre are required.")
    price = as_decimal(data.get("price"), "Price")
    if price <= 0:
        raise ApiError("Price must be greater than zero.")
    isbn = re.sub(r"[^\dXx]", "", str(data.get("isbn") or ""))
    if isbn and len(isbn) not in (10, 13):
        raise ApiError("ISBN must be 10 or 13 digits.")
    cover = str(data.get("coverUrl") or "").strip()
    if cover and not cover.startswith(("https://", "http://", "/static/")):
        raise ApiError("Cover URL must start with http:// or https://.")
    if not cover and isbn:
        # Open Library serves covers by ISBN; the UI falls back to a generated cover if none exists.
        cover = f"https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false"
    fields = {
        "title": title[:200], "author": author[:120], "genre": genre[:60], "price": price,
        "isbn": isbn or None, "cover_url": cover[:500] or None,
        "year": as_int(data["year"], "Year") if data.get("year") not in (None, "") else None,
        "pages": as_int(data["pages"], "Pages", 1) if data.get("pages") not in (None, "") else None,
        "description": str(data.get("description") or "").strip()[:1000],
    }
    if creating:
        fields["stock"] = as_int(data.get("stock", 0), "Initial stock", 0)
    return fields


@api.post("/admin/books")
@admin_required
def create_book():
    fields = book_fields(body(), creating=True)
    count = query("SELECT COUNT(*) AS n FROM books", one=True)["n"]
    fields["color1"], fields["color2"] = COVER_COLORS[count % len(COVER_COLORS)]
    book_id, _ = execute(f"INSERT INTO books ({', '.join(fields)}) VALUES ({placeholders(fields)})", tuple(fields.values()))
    if fields["stock"]:
        execute("INSERT INTO restocks (book_id, qty, note) VALUES (%s, %s, 'Initial stock')", (book_id, fields["stock"]))
    commit()
    return jsonify(book=book_json(active_book(book_id))), 201


@api.put("/admin/books/<int:book_id>")
@admin_required
def update_book(book_id):
    old = active_book(book_id)
    fields = book_fields(body(), creating=False)  # stock only changes through restocks
    execute(f"UPDATE books SET {', '.join(f'{k} = %s' for k in fields)} WHERE id = %s", (*fields.values(), book_id))
    commit()
    if old["cover_url"] != fields["cover_url"]:
        remove_unused_upload(old["cover_url"])
    return jsonify(book=book_json(active_book(book_id)))


@api.patch("/admin/books/<int:book_id>/cover")
@admin_required
def set_book_cover(book_id):
    """Swap just the cover (used when an image is dropped onto a row in the inventory table)."""
    old = active_book(book_id)
    url = str(body().get("coverUrl") or "").strip()
    if url and not url.startswith(("https://", "http://", "/static/")):
        raise ApiError("Cover URL must start with http:// or https://.")
    execute("UPDATE books SET cover_url = %s WHERE id = %s", (url[:500] or None, book_id))
    commit()
    if old["cover_url"] != url:
        remove_unused_upload(old["cover_url"])
    return jsonify(book=book_json(active_book(book_id)))


# ---------------------------------------------------------------- cover uploads

def upload_dir():
    path = Path(current_app.static_folder) / "uploads" / "covers"
    path.mkdir(parents=True, exist_ok=True)
    return path


def remove_unused_upload(url):
    """Delete an uploaded cover file once no book points at it any more."""
    if not url or not url.startswith(COVER_UPLOAD_URL):
        return
    if query("SELECT 1 FROM books WHERE cover_url = %s LIMIT 1", (url,), one=True):
        return
    (upload_dir() / Path(url).name).unlink(missing_ok=True)  # .name keeps it inside the folder


@api.delete("/admin/uploads/cover")
@admin_required
def discard_cover_upload():
    """Delete an uploaded cover the admin didn't end up using (only if no book references it)."""
    url = str(body().get("url") or "")
    if url.startswith(COVER_UPLOAD_URL):
        remove_unused_upload(url)
    return jsonify(ok=True)


@api.post("/admin/uploads/cover")
@admin_required
def upload_cover():
    file = request.files.get("image")
    if not file or not file.filename:
        raise ApiError("Choose an image to upload.")
    data = file.read(COVER_MAX_BYTES + 1)
    if len(data) > COVER_MAX_BYTES:
        raise ApiError("Images must be 5 MB or smaller.", 413)

    # Decode and re-encode the image: this rejects anything that isn't really an image,
    # drops metadata (e.g. GPS from phone photos) and keeps covers a sensible size.
    unsupported = "That file isn't a supported image. Use JPG, PNG, WebP or GIF."
    try:
        with Image.open(io.BytesIO(data)) as probe:
            fmt = probe.format
            probe.verify()
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError, ValueError):
        raise ApiError(unsupported)
    if fmt not in COVER_FORMATS:
        raise ApiError(unsupported)

    img = ImageOps.exif_transpose(img)
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        flat = Image.new("RGB", img.size, (255, 255, 255))
        flat.paste(img, mask=img.getchannel("A"))
        img = flat
    else:
        img = img.convert("RGB")
    img.thumbnail(COVER_MAX_SIZE, Image.Resampling.LANCZOS)

    name = secrets.token_hex(12) + ".webp"
    img.save(upload_dir() / name, "WEBP", quality=86, method=6)
    return jsonify(url=COVER_UPLOAD_URL + name, width=img.width, height=img.height), 201


@api.delete("/admin/books/<int:book_id>")
@admin_required
def delete_book(book_id):
    active_book(book_id)
    execute("UPDATE books SET is_active = 0 WHERE id = %s", (book_id,))
    execute("DELETE FROM cart_items WHERE book_id = %s", (book_id,))
    execute("DELETE FROM wishlist_items WHERE book_id = %s", (book_id,))
    commit()
    return jsonify(ok=True)


@api.post("/admin/books/<int:book_id>/restock")
@admin_required
def restock_book(book_id):
    data = body()
    active_book(book_id, lock=True)
    qty = as_int(data.get("qty"), "Quantity", 1)
    execute("UPDATE books SET stock = stock + %s WHERE id = %s", (qty, book_id))
    execute("INSERT INTO restocks (book_id, qty, note) VALUES (%s, %s, %s)",
            (book_id, qty, str(data.get("note") or "").strip()[:200] or None))
    commit()
    return jsonify(book=book_json(active_book(book_id)))


@api.get("/admin/books/<int:book_id>/restocks")
@admin_required
def book_restocks(book_id):
    rows = query("SELECT * FROM restocks WHERE book_id = %s ORDER BY created_at DESC, id DESC", (book_id,))
    return jsonify(restocks=[{"id": r["id"], "bookId": r["book_id"], "qty": r["qty"], "note": r["note"] or "",
                              "date": int(r["created_at"].timestamp() * 1000)} for r in rows])


@api.get("/admin/orders")
@admin_required
def admin_orders():
    return jsonify(orders=orders_with_items())


@api.patch("/admin/orders/<order_id>")
@admin_required
def admin_update_order(order_id):
    set_status(order_id, body().get("status"))
    return jsonify(order=orders_with_items("WHERE id = %s", (order_id,))[0])
