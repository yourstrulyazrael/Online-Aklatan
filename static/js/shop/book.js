document.addEventListener("DOMContentLoaded", async () => {
  const { $, esc, money, cover, stars, stockBadge } = UI;
  const root = $("#book-page");
  const id = Number(root.dataset.bookId);
  const user = Store.currentUser();
  UI.loading(root);

  let book, reviews;
  async function load() { ({ book, reviews } = await Store.book(id)); }
  try { await load(); }
  catch (err) {
    root.innerHTML = `<div class="empty"><div class="empty-icon">📕</div><h2>Book not found</h2><p>${esc(err.message)}</p><a class="btn btn-primary" href="/">Back to shop</a></div>`;
    return;
  }
  document.title = `${book.title} · Online Aklatan`;
  Store.trackView(id);

  function renderMain() {
    const b = book;
    const r = b.rating;
    root.innerHTML = `
      <nav class="breadcrumb"><a href="/">Shop</a> / <a href="/?genre=${encodeURIComponent(b.genre)}">${esc(b.genre)}</a> / ${esc(b.title)}</nav>
      <div class="book-detail">
        <div>${cover(b, "cover-lg")}</div>
        <div>
          <span class="genre-tag">${esc(b.genre)}</span>
          <h1>${esc(b.title)}</h1>
          <p class="muted">by <strong>${esc(b.author)}</strong></p>
          <div>${stars(r.avg, r.count)} <span class="small muted">${r.count ? r.avg.toFixed(1) + " average" : "No reviews yet"}</span></div>
          <div class="buy-box">
            <span class="big-price">${money(b.price)}</span>
            ${stockBadge(b.stock)}
          </div>
          <div class="buy-box">
            <div class="qty" role="group" aria-label="Quantity">
              <button type="button" data-step="-1" aria-label="Decrease">−</button>
              <input type="number" id="qty" value="1" min="1" max="${b.stock}" aria-label="Quantity" ${b.stock <= 0 ? "disabled" : ""}>
              <button type="button" data-step="1" aria-label="Increase">+</button>
            </div>
            <button class="btn btn-primary" id="add-btn" ${b.stock <= 0 ? "disabled" : ""}>Add to cart</button>
            <button class="btn btn-ghost" id="buy-btn" ${b.stock <= 0 ? "disabled" : ""}>Buy now</button>
            <button class="btn btn-ghost" id="wish-btn" aria-pressed="${b.wished}">${b.wished ? "♥ Saved" : "♡ Wishlist"}</button>
          </div>
          ${user ? "" : `<p class="small muted">🔒 <a href="/login?next=${encodeURIComponent(location.pathname)}">Sign in</a> to buy this book.</p>`}
          <p>${esc(b.description)}</p>
          <dl class="book-meta">
            <div><dt>Published</dt><dd>${esc(b.year || "—")}</dd></div>
            <div><dt>Pages</dt><dd>${esc(b.pages || "—")}</dd></div>
            <div><dt>ISBN</dt><dd>${esc(b.isbn || "—")}</dd></div>
            <div><dt>Genre</dt><dd>${esc(b.genre)}</dd></div>
          </dl>
          <p class="small muted">🚚 Free shipping on orders over ${money(Store.FREE_SHIPPING_MIN)} · 💵 Cash on delivery available</p>
        </div>
      </div>`;

    const qty = $("#qty");
    const clampQty = () => (qty.value = Math.max(1, Math.min(b.stock, Number(qty.value) || 1)));
    root.querySelectorAll("[data-step]").forEach((btn) =>
      btn.addEventListener("click", () => { qty.value = Number(qty.value) + Number(btn.dataset.step); clampQty(); }));
    qty.addEventListener("change", clampQty);

    const add = async () => {
      try { await Store.addToCart(id, Number(qty.value)); return true; }
      catch (err) { UI.handleError(err); return false; }
    };
    $("#add-btn").addEventListener("click", () => UI.requireSignIn("add books to your cart", async () => {
      if (await add()) UI.toast(`Added ${qty.value} to cart`, "good");
    }));
    $("#buy-btn").addEventListener("click", () => UI.requireSignIn("buy this book", async () => {
      if (await add()) location.href = "/checkout";
    }));
    $("#wish-btn").addEventListener("click", () => UI.requireSignIn("save books to your wishlist", async () => {
      try { book.wished = await Store.toggleWishlist(id); renderMain(); }
      catch (err) { UI.handleError(err); }
    }));
  }

  function renderReviews() {
    const r = book.rating;
    $("#reviews-card").hidden = false;
    $("#review-summary").innerHTML = r.count ? `${stars(r.avg)} <strong>${r.avg.toFixed(1)}</strong> <span class="muted small">from ${r.count} review${r.count > 1 ? "s" : ""}</span>` : "";
    $("#review-list").innerHTML = reviews.length ? reviews.map((rv) => `
      <div class="review">
        <div class="review-head"><strong>${esc(rv.user)}</strong><span class="muted small">${UI.date(rv.date)}</span></div>
        <div>${stars(rv.rating)}</div>
        <p style="margin:.3em 0 0">${esc(rv.text)}</p>
      </div>`).join("") : `<p class="muted">Be the first to review this book.</p>`;
    $("#review-form").hidden = !user;
    $("#review-login").hidden = !!user;
  }

  $("#review-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      await Store.addReview(id, Number(e.target.elements.rating.value), $("#review-text").value);
      $("#review-text").value = "";
      UI.toast("Thanks for your review!", "good");
      await load();
      renderReviews();
      renderMain();
    } catch (err) { UI.handleError(err); }
    finally { btn.disabled = false; }
  });

  async function renderRelated() {
    const rel = (await Store.books()).filter((b) => b.genre === book.genre && b.id !== id).slice(0, 6);
    if (!rel.length) return;
    $("#related").hidden = false;
    $("#related-genre").textContent = book.genre;
    $("#related-grid").innerHTML = rel.map(UI.bookCard).join("");
  }

  UI.bindCardActions($("#related-grid"));
  renderMain();
  renderReviews();
  renderRelated().catch(() => {});
});
