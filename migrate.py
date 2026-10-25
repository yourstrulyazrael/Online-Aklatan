"""Apply the SQL files in migrations/ to MySQL (XAMPP or MySQL Server).

    python migrate.py              create the database if needed, then apply new migrations
    python migrate.py --status     list migrations and whether each has been applied
    python migrate.py --seed       also add demo customers, reviews and 90 days of orders
    python migrate.py --fresh      DROP the database and rebuild it from scratch (asks first)

Each file runs once; applied versions are recorded in the `schema_migrations` table.
To change the schema, add a new file such as migrations/003_add_publisher.sql.
"""
import argparse
import re
import sys
from pathlib import Path

import mysql.connector

from config import DB_CONFIG
from database import connect

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


def split_statements(sql):
    """Split a .sql file into statements on semicolons, ignoring ones inside quotes and comments."""
    statements, buf, quote, i = [], [], None, 0
    while i < len(sql):
        ch = sql[i]
        if quote:
            buf.append(ch)
            if ch == "\\" and i + 1 < len(sql):
                buf.append(sql[i + 1])
                i += 1
            elif ch == quote:
                if i + 1 < len(sql) and sql[i + 1] == quote:  # '' escape
                    buf.append(sql[i + 1])
                    i += 1
                else:
                    quote = None
        elif ch in ("'", '"', "`"):
            quote = ch
            buf.append(ch)
        elif sql.startswith("--", i) or ch == "#":
            i = sql.find("\n", i)
            if i == -1:
                break
            continue
        elif sql.startswith("/*", i):
            i = sql.find("*/", i) + 2
            continue
        elif ch == ";":
            stmt = "".join(buf).strip()
            if stmt:
                statements.append(stmt)
            buf = []
        else:
            buf.append(ch)
        i += 1
    stmt = "".join(buf).strip()
    if stmt:
        statements.append(stmt)
    return statements


def migration_files():
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    for f in files:
        if not re.match(r"^\d{3}_", f.name):
            sys.exit(f"Migration files must start with a 3-digit number: {f.name}")
    return files


def ensure_database():
    name = DB_CONFIG["database"]
    conn = connect(database=None)
    cur = conn.cursor()
    cur.execute(f"CREATE DATABASE IF NOT EXISTS `{name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
    conn.close()


def ensure_history(cur):
    cur.execute("""CREATE TABLE IF NOT EXISTS schema_migrations (
                       version    VARCHAR(255) NOT NULL PRIMARY KEY,
                       applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""")


def applied_versions(cur):
    cur.execute("SELECT version FROM schema_migrations")
    return {row[0] for row in cur.fetchall()}


def migrate():
    ensure_database()
    conn = connect()
    cur = conn.cursor()
    ensure_history(cur)
    done = applied_versions(cur)
    pending = [f for f in migration_files() if f.stem not in done]
    if not pending:
        print("Database is up to date.")
    for f in pending:
        print(f"Applying {f.name} ...", end=" ", flush=True)
        try:
            for stmt in split_statements(f.read_text(encoding="utf-8")):
                cur.execute(stmt)
            cur.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (f.stem,))
            conn.commit()
        except mysql.connector.Error as e:
            conn.rollback()
            # MySQL commits DDL (CREATE/ALTER) immediately, so a failed file may be partly applied.
            # Fix the file and run again; CREATE TABLE IF NOT EXISTS / INSERT IGNORE make reruns safe.
            sys.exit(f"failed\n  {e}")
        print("done")
    conn.close()


def status():
    ensure_database()
    conn = connect()
    cur = conn.cursor()
    ensure_history(cur)
    done = applied_versions(cur)
    for f in migration_files():
        print(f"  [{'x' if f.stem in done else ' '}] {f.name}")
    conn.close()


def fresh():
    name = DB_CONFIG["database"]
    answer = input(f"This deletes the '{name}' database and everything in it. Type the name to confirm: ")
    if answer.strip() != name:
        sys.exit("Cancelled.")
    conn = connect(database=None)
    conn.cursor().execute(f"DROP DATABASE IF EXISTS `{name}`")
    conn.close()
    print(f"Dropped '{name}'.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--status", action="store_true", help="show which migrations have run")
    parser.add_argument("--seed", action="store_true", help="add demo customers, reviews and orders")
    parser.add_argument("--fresh", action="store_true", help="drop and recreate the database first")
    args = parser.parse_args()

    target = f"{DB_CONFIG['user']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}"
    print(f"MySQL: {target}")
    try:
        if args.status:
            status()
            return
        if args.fresh:
            fresh()
        migrate()
        if args.seed:
            import seed_demo
            seed_demo.run()
    except mysql.connector.Error as e:
        sys.exit(f"Could not use MySQL at {target}:\n  {e}\n"
                 "Is MySQL running (XAMPP Control Panel -> Start MySQL), and are the DB_* values in .env right?")


if __name__ == "__main__":
    main()
