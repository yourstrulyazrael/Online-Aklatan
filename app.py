import json
from functools import wraps

import mysql.connector
from flask import Flask, abort, jsonify, redirect, render_template, request, url_for
from markupsafe import Markup

import database
from api import api, cart_count, current_user
from config import Config, DB_CONFIG
from database import query, user_json

app = Flask(__name__)
app.config.from_object(Config)
database.init_app(app)
app.register_blueprint(api)


@app.errorhandler(mysql.connector.Error)
def database_unavailable(e):
    app.logger.error("MySQL error: %s", e)
    if request.path.startswith("/api/"):
        return jsonify(error="The database is unavailable. Please try again shortly."), 503
    target = f"{DB_CONFIG['user']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}"
    return render_template("db_error.html", target=target, error=str(e)), 503


@app.before_request
def check_database():
    # Borrow the connection up front so a stopped MySQL shows the help page instead of a broken shop.
    if not request.path.startswith("/static/"):
        database.get_db()


@app.errorhandler(413)
def too_large(_e):
    return jsonify(error="Images must be 5 MB or smaller."), 413


@app.context_processor
def inject_client_state():
    """Hand the signed-in user and store settings to the page's JavaScript."""
    try:
        user = current_user()
        count = cart_count(user["id"]) if user else 0
    except mysql.connector.Error:
        user, count = None, 0  # the database error page still has to render
    state = {
        "user": user_json(user) if user else None,
        "cartCount": count,
        "config": {k: app.config[k] for k in ("SHIPPING_FEE", "FREE_SHIPPING_MIN", "LOW_STOCK")},
    }
    # Escape "<" so the JSON can't close the <script> tag it is embedded in.
    return {"client_state": Markup(json.dumps(state).replace("<", "\\u003c")), "user": user}


def login_page_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user():
            return redirect(url_for("login", next=request.full_path.rstrip("?")))
        return fn(*args, **kwargs)
    return wrapper


def admin_page_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return redirect(url_for("login", next=request.path))
        if user["role"] != "admin":
            return redirect(url_for("index"))
        return fn(*args, **kwargs)
    return wrapper


# ---------- Storefront ----------
@app.route("/")
def index():
    return render_template("shop/index.html")


@app.route("/book/<int:book_id>")
def book_detail(book_id):
    return render_template("shop/book.html", book_id=book_id)


@app.route("/cart")
@login_page_required
def cart():
    return render_template("shop/cart.html")


@app.route("/checkout")
@login_page_required
def checkout():
    return render_template("shop/checkout.html")


@app.route("/order/<order_id>")
@login_page_required
def order_success(order_id):
    order = query("SELECT user_id FROM orders WHERE id = %s", (order_id,), one=True)
    user = current_user()
    if not order or (order["user_id"] != user["id"] and user["role"] != "admin"):
        abort(404)
    return render_template("shop/order_success.html", order_id=order_id)


@app.route("/orders")
@login_page_required
def orders():
    return render_template("shop/orders.html")


@app.route("/wishlist")
@login_page_required
def wishlist():
    return render_template("shop/wishlist.html")


@app.route("/login")
def login():
    if current_user():
        nxt = request.args.get("next") or ""
        safe = nxt.startswith("/") and not nxt.startswith("//")
        return redirect(nxt if safe else url_for("index"))
    return render_template("auth/login.html")


# ---------- Admin ----------
@app.route("/admin")
@admin_page_required
def admin_dashboard():
    return render_template("admin/dashboard.html")


@app.route("/admin/books")
@admin_page_required
def admin_books():
    return render_template("admin/books.html")


@app.route("/admin/analytics")
@admin_page_required
def admin_analytics():
    return render_template("admin/analytics.html")


@app.route("/admin/orders")
@admin_page_required
def admin_orders():
    return render_template("admin/orders.html")


if __name__ == "__main__":
    app.run(debug=True)
