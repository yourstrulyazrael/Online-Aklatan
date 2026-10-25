-- 001: initial schema for the bookstore.
-- Run with `python migrate.py`, or import this file in phpMyAdmin (XAMPP) after creating the database.

CREATE TABLE IF NOT EXISTS users (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          ENUM('customer', 'admin') NOT NULL DEFAULT 'customer',
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS books (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    title       VARCHAR(200) NOT NULL,
    author      VARCHAR(120) NOT NULL,
    genre       VARCHAR(60)  NOT NULL,
    isbn        VARCHAR(20)  NULL,
    price       DECIMAL(10, 2) NOT NULL,
    stock       INT UNSIGNED NOT NULL DEFAULT 0,
    year        SMALLINT NULL,
    pages       INT UNSIGNED NULL,
    description TEXT NULL,
    cover_url   VARCHAR(500) NULL,
    color1      CHAR(7) NOT NULL DEFAULT '#1f3d36',
    color2      CHAR(7) NOT NULL DEFAULT '#3e7a66',
    views       INT UNSIGNED NOT NULL DEFAULT 0,
    -- Removed books are hidden instead of deleted so past orders keep their link.
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_books_genre (genre),
    KEY ix_books_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reviews (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    book_id    INT UNSIGNED NOT NULL,
    user_id    INT UNSIGNED NOT NULL,
    rating     TINYINT UNSIGNED NOT NULL,
    text       TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_reviews_book (book_id),
    CONSTRAINT fk_reviews_book FOREIGN KEY (book_id) REFERENCES books (id),
    CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
    id               VARCHAR(24) NOT NULL,
    user_id          INT UNSIGNED NOT NULL,
    customer_name    VARCHAR(100) NOT NULL,
    email            VARCHAR(120) NOT NULL,
    phone            VARCHAR(20)  NOT NULL,
    address          VARCHAR(255) NOT NULL,
    city             VARCHAR(80)  NOT NULL,
    notes            VARCHAR(255) NULL,
    subtotal         DECIMAL(10, 2) NOT NULL,
    discount         DECIMAL(10, 2) NOT NULL DEFAULT 0,
    shipping         DECIMAL(10, 2) NOT NULL DEFAULT 0,
    total            DECIMAL(10, 2) NOT NULL,
    promo_code       VARCHAR(30) NULL,
    -- Only non-sensitive payment details are stored (never full card numbers or CVVs).
    payment_method   ENUM('cash', 'ewallet', 'card') NOT NULL,
    payment_provider VARCHAR(40) NOT NULL,
    payment_last4    CHAR(4)     NULL,
    payment_account  VARCHAR(20) NULL,
    payment_ref      VARCHAR(40) NULL,
    change_for       DECIMAL(10, 2) NULL,
    status           ENUM('Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled') NOT NULL DEFAULT 'Pending',
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_orders_user (user_id),
    KEY ix_orders_status (status),
    KEY ix_orders_created (created_at),
    CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
    id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id VARCHAR(24) NOT NULL,
    book_id  INT UNSIGNED NOT NULL,
    title    VARCHAR(200) NOT NULL,      -- snapshot at purchase time
    price    DECIMAL(10, 2) NOT NULL,    -- snapshot at purchase time
    qty      INT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    KEY ix_order_items_order (order_id),
    KEY ix_order_items_book (book_id),
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
    CONSTRAINT fk_order_items_book FOREIGN KEY (book_id) REFERENCES books (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS restocks (
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    book_id    INT UNSIGNED NOT NULL,
    qty        INT UNSIGNED NOT NULL,
    note       VARCHAR(200) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_restocks_book (book_id),
    CONSTRAINT fk_restocks_book FOREIGN KEY (book_id) REFERENCES books (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cart_items (
    user_id INT UNSIGNED NOT NULL,
    book_id INT UNSIGNED NOT NULL,
    qty     INT UNSIGNED NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, book_id),
    CONSTRAINT fk_cart_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_cart_book FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wishlist_items (
    user_id    INT UNSIGNED NOT NULL,
    book_id    INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, book_id),
    CONSTRAINT fk_wish_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_wish_book FOREIGN KEY (book_id) REFERENCES books (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
