-- 002: starter catalog and demo accounts.
-- Admin: admin@bookstore.com / admin123   Customer: juan@mail.com / juan123
-- Uses INSERT IGNORE so running it again never duplicates rows.

INSERT IGNORE INTO users (id, name, email, password_hash, role) VALUES
    (1, 'Store Admin', 'admin@bookstore.com', 'scrypt:32768:8:1$6glblzpN6JL9g5U9$bd15c83d383b2053ed21408fc68ffd208b5c956684412d31bbd0b82139afbde62192551821c7bea9df9ceaf87f8198daa1d086fb534bdb975cc153259835a798', 'admin'),
    (2, 'Juan dela Cruz', 'juan@mail.com', 'scrypt:32768:8:1$lTzQtdSslMI5sgmJ$407e3b0794542a4a5843ce4c71b3462732ba87af02166bbf03e68fc5d18c7944e61caf2ae047065e21ca8fee0fdf729d77695f7f3d5a0d02d9cad029b058218c', 'customer');

INSERT IGNORE INTO books (id, title, author, genre, isbn, price, stock, year, pages, description, cover_url, color1, color2, created_at) VALUES
    (1, 'To Kill a Mockingbird', 'Harper Lee', 'Classics', '9780061120084', 495.00, 18, 1960, 336, 'A gripping tale of racial injustice and childhood innocence in the American South.', '/static/covers/9780061120084.jpg', '#1f3d36', '#3e7a66', NOW() - INTERVAL 120 DAY),
    (2, '1984', 'George Orwell', 'Classics', '9780451524935', 420.00, 25, 1949, 328, 'A dystopian vision of a totalitarian future where Big Brother is always watching.', '/static/covers/9780451524935.jpg', '#5a1e2b', '#a33a4f', NOW() - INTERVAL 121 DAY),
    (3, 'Pride and Prejudice', 'Jane Austen', 'Romance', '9780141439518', 380.00, 14, 1813, 432, 'Elizabeth Bennet navigates manners, morality, and marriage in Regency England.', '/static/covers/9780141439518.jpg', '#22314f', '#4a6aa8', NOW() - INTERVAL 122 DAY),
    (4, 'The Great Gatsby', 'F. Scott Fitzgerald', 'Classics', '9780743273565', 399.00, 16, 1925, 180, 'Jay Gatsby''s lavish pursuit of the American Dream and the elusive Daisy Buchanan.', '/static/covers/9780743273565.jpg', '#4b3621', '#9c6b3c', NOW() - INTERVAL 123 DAY),
    (5, 'Dune', 'Frank Herbert', 'Sci-Fi', '9780441172719', 650.00, 22, 1965, 688, 'On the desert planet Arrakis, Paul Atreides becomes the center of a galactic struggle.', '/static/covers/9780441172719.jpg', '#3b2a4f', '#7a59a6', NOW() - INTERVAL 124 DAY),
    (6, 'The Hobbit', 'J.R.R. Tolkien', 'Fantasy', '9780547928227', 560.00, 23, 1937, 310, 'Bilbo Baggins is swept into a quest to reclaim a treasure guarded by a dragon.', '/static/covers/9780547928227.jpg', '#173f4f', '#2f8aa8', NOW() - INTERVAL 125 DAY),
    (7, 'Sapiens', 'Yuval Noah Harari', 'Non-Fiction', '9780062316097', 790.00, 12, 2011, 464, 'A brief history of humankind, from the Stone Age to the twenty-first century.', '/static/covers/9780062316097.jpg', '#4f2a17', '#c06030', NOW() - INTERVAL 126 DAY),
    (8, 'Atomic Habits', 'James Clear', 'Self-Help', '9780735211292', 850.00, 30, 2018, 320, 'An easy and proven way to build good habits and break bad ones.', '/static/covers/9780735211292.jpg', '#2d3a1c', '#6b8a3a', NOW() - INTERVAL 127 DAY),
    (9, 'The Silent Patient', 'Alex Michaelides', 'Mystery', '9781250301697', 595.00, 3, 2019, 336, 'A woman shoots her husband and never speaks again. A psychotherapist sets out to learn why.', '/static/covers/9781250301697.jpg', '#1f3d36', '#3e7a66', NOW() - INTERVAL 128 DAY),
    (10, 'Project Hail Mary', 'Andy Weir', 'Sci-Fi', '9780593135204', 720.00, 19, 2021, 496, 'A lone astronaut must save Earth from an extinction-level threat.', '/static/covers/9780593135204.jpg', '#5a1e2b', '#a33a4f', NOW() - INTERVAL 129 DAY),
    (11, 'Noli Me Tángere', 'José Rizal', 'Classics', '9780143039693', 350.00, 27, 1887, 438, 'Rizal''s landmark novel exposing the abuses of colonial rule in the Philippines.', '/static/covers/9780143039693.jpg', '#22314f', '#4a6aa8', NOW() - INTERVAL 130 DAY),
    (12, 'The Midnight Library', 'Matt Haig', 'Fiction', '9780525559474', 560.00, 22, 2020, 304, 'Between life and death there is a library, and every book is a life you could have lived.', '/static/covers/9780525559474.jpg', '#4b3621', '#9c6b3c', NOW() - INTERVAL 131 DAY),
    (13, 'Gone Girl', 'Gillian Flynn', 'Mystery', '9780307588371', 540.00, 11, 2012, 432, 'On their fifth anniversary, Amy Dunne disappears and her husband becomes the prime suspect.', '/static/covers/9780307588371.jpg', '#3b2a4f', '#7a59a6', NOW() - INTERVAL 132 DAY),
    (14, 'The Name of the Wind', 'Patrick Rothfuss', 'Fantasy', '9780756404741', 680.00, 0, 2007, 662, 'Kvothe recounts his journey from gifted child to legendary arcanist.', '/static/covers/9780756404741.jpg', '#173f4f', '#2f8aa8', NOW() - INTERVAL 133 DAY),
    (15, 'Educated', 'Tara Westover', 'Biography', '9780399590504', 610.00, 9, 2018, 352, 'A memoir of a woman who leaves her survivalist family and goes on to earn a PhD.', '/static/covers/9780399590504.jpg', '#4f2a17', '#c06030', NOW() - INTERVAL 134 DAY),
    (16, 'The Psychology of Money', 'Morgan Housel', 'Self-Help', '9780857197689', 699.00, 7, 2020, 256, 'Timeless lessons on wealth, greed, and happiness.', '/static/covers/9780857197689.jpg', '#2d3a1c', '#6b8a3a', NOW() - INTERVAL 135 DAY),
    (17, 'Clean Code', 'Robert C. Martin', 'Technology', '9780132350884', 1450.00, 2, 2008, 464, 'A handbook of agile software craftsmanship.', '/static/covers/9780132350884.jpg', '#1f3d36', '#3e7a66', NOW() - INTERVAL 136 DAY),
    (18, 'Where the Crawdads Sing', 'Delia Owens', 'Fiction', '9780735219090', 575.00, 19, 2018, 384, 'The Marsh Girl grows up alone in the wild of coastal North Carolina.', '/static/covers/9780735219090.jpg', '#5a1e2b', '#a33a4f', NOW() - INTERVAL 137 DAY);

-- Opening stock movement for each book, so the restock history starts at the right level.
INSERT INTO restocks (book_id, qty, note, created_at)
SELECT b.id, b.stock, 'Initial stock', b.created_at FROM books b
WHERE b.id <= 18 AND b.stock > 0 AND NOT EXISTS (SELECT 1 FROM restocks r WHERE r.book_id = b.id);
