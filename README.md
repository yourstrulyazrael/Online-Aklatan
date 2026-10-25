# Online Aklatan

A Flask + MySQL bookstore: customers browse and buy books (cash on delivery, e-wallet or card),
and admins manage inventory, restocks, orders and per-book analytics. Database access is plain SQL
through `mysql-connector-python`; there is no ORM.

## Setup

1. **Install the Python packages**

   ```
   pip install -r requirements.txt
   ```

2. **Start MySQL.** Either works:
   - **XAMPP:** open the XAMPP Control Panel and click **Start** next to *MySQL*.
   - **MySQL Server (MySQL80 service):** make sure the service is running.

3. **Point the app at your database.** Edit `.env` (copy `.env.example` if it's missing).
   XAMPP's defaults are `DB_USER=root` with an empty `DB_PASSWORD`. For MySQL Server, use the
   root password you set during installation.

4. **Run the migrations**

   ```
   python migrate.py --seed
   ```

   This creates the `bookstore` database, applies every file in `migrations/` that hasn't run yet,
   and (`--seed`) adds sample shoppers, reviews and 90 days of orders so the analytics have data.
   Leave off `--seed` for an empty store with just the catalog and demo accounts.

5. **Run the app**

   ```
   python app.py
   ```

   Open http://127.0.0.1:5000

## Migrations

| File | What it does |
|------|--------------|
| `migrations/001_create_tables.sql` | Creates all tables, keys and foreign keys (InnoDB, utf8mb4) |
| `migrations/002_seed_catalog.sql` | Adds the 18 books, their opening stock and the two demo accounts |

```
python migrate.py            # apply new migrations
python migrate.py --status   # see which have run
python migrate.py --fresh    # drop the database and rebuild it (asks for confirmation)
```

Applied files are recorded in the `schema_migrations` table, so each runs once. To change the
schema, add the next numbered file, e.g. `migrations/003_add_publisher.sql`:

```sql
ALTER TABLE books ADD COLUMN publisher VARCHAR(120) NULL AFTER author;
```

**Using phpMyAdmin instead (XAMPP):** create a database named `bookstore` (collation
`utf8mb4_unicode_ci`), then open it, go to **Import**, and import `001_create_tables.sql` followed
by `002_seed_catalog.sql`. If you later switch to `python migrate.py`, it will re-run those two
files once; that's safe because they use `CREATE TABLE IF NOT EXISTS` and `INSERT IGNORE`.

## Demo accounts

| Role     | Email               | Password |
|----------|---------------------|----------|
| Admin    | admin@bookstore.com | admin123 |
| Customer | juan@mail.com       | juan123  |

## Project layout

| Path | What it is |
|------|------------|
| `app.py` | Page routes and login/admin guards |
| `api.py` | JSON API (`/api/...`) used by the pages, written in SQL |
| `database.py` | Connection pool, query helpers, row-to-JSON helpers |
| `migrate.py` | Migration runner |
| `seed_demo.py` | Sample shoppers, reviews and orders (`migrate.py --seed`) |
| `config.py` | Settings, read from `.env` |
| `migrations/` | Numbered `.sql` migration files |
| `static/covers/` | Cover images for the demo books (from Open Library) |
| `static/uploads/covers/` | Covers uploaded from the admin (not in git) |
| `static/js/store.js` | Browser-side API client |

## Book covers

In **Admin → Inventory**, the Add/Edit book form takes a cover image by drag & drop, by clicking
to browse, or by pasting from the clipboard (Ctrl+V). You can also drop an image straight onto any
row in the inventory table to replace that book's cover.

Uploads (JPG, PNG, WebP or GIF, up to 5 MB) are checked and re-saved as WebP by Pillow, scaled down
to at most 800×1200, and stored in `static/uploads/covers/`. Files that end up unused (replaced,
removed, or uploaded in a form you cancelled) are deleted automatically.

Notes: buying requires an account (guests get a sign-in prompt). Card and e-wallet payments are
simulated; only the card brand and last 4 digits are ever sent to the server or stored.
