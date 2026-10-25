import os

from dotenv import load_dotenv

load_dotenv()

# MySQL connection settings. The defaults match a stock XAMPP install (user root, no password).
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "root"),
    "password": os.getenv("DB_PASSWORD", ""),
    "database": os.getenv("DB_NAME", "bookstore"),
}


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-me")
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    MAX_CONTENT_LENGTH = 6 * 1024 * 1024  # cover uploads are capped at 5 MB; this leaves room for the form

    # Store rules shared with the front-end.
    SHIPPING_FEE = 80
    FREE_SHIPPING_MIN = 1500
    LOW_STOCK = 5
    PROMOS = {
        "BOOKWORM10": {"type": "percent", "value": 10, "label": "10% off your order"},
        "READMORE50": {"type": "flat", "value": 50, "label": "₱50 off", "min": 500},
        "FREESHIP": {"type": "shipping", "value": 0, "label": "Free shipping"},
    }
