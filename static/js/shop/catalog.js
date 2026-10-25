document.addEventListener("DOMContentLoaded", async () => {
  const { $, esc, bookCard, cover } = UI;
  const grid = $("#book-grid");
  UI.loading(grid, "Loading books…");

  let books;
  try { books = await Store.books(); }
  catch (err) { grid.innerHTML = `<div class="empty" style="grid-column:1/-1">Couldn't load the catalog. ${esc(err.message)}</div>`; return; }

  const maxPrice = Math.ceil(Math.max(50, ...books.map((b) => b.price)) / 50) * 50;
  const params = new URLSearchParams(location.search);
  const state = { genre: params.get("genre") || "All", q: params.get("q") || "", sort: "popular", max: maxPrice, inStock: false };

  // Hero: the four best sellers.
  $("#hero-books").innerHTML = [...books].sort((a, b) => b.sold - a.sold).slice(0, 4).map((b) => cover(b)).join("");

  const range = $("#max-price");
  range.max = maxPrice;
  range.value = maxPrice;

  function renderGenres() {
    const counts = books.reduce((m, b) => ((m[b.genre] = (m[b.genre] || 0) + 1), m), {});
    const genres = ["All", ...Object.keys(counts).sort()];
    $("#genre-list").innerHTML = genres.map((g) =>
      `<button type="button" data-genre="${esc(g)}" class="${g === state.genre ? "active" : ""}">
        <span>${esc(g)}</span><span class="muted small">${g === "All" ? books.length : counts[g]}</span>
      </button>`).join("");
  }

  function render() {
    const q = state.q.trim().toLowerCase();
    const list = books.filter((b) =>
      (state.genre === "All" || b.genre === state.genre) &&
      b.price <= state.max &&
      (!state.inStock || b.stock > 0) &&
      (!q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.isbn.includes(q)));

    const sorters = {
      popular: (a, b) => b.sold - a.sold,
      rating: (a, b) => b.rating.avg - a.rating.avg,
      newest: (a, b) => (b.year || 0) - (a.year || 0),
      "price-asc": (a, b) => a.price - b.price,
      "price-desc": (a, b) => b.price - a.price,
      title: (a, b) => a.title.localeCompare(b.title),
    };
    list.sort(sorters[state.sort]);

    $("#max-price-label").textContent = UI.money(state.max);
    $("#result-count").textContent = `${list.length} book${list.length === 1 ? "" : "s"}${state.genre !== "All" ? " in " + state.genre : ""}`;
    grid.innerHTML = list.length
      ? list.map(bookCard).join("")
      : `<div class="empty" style="grid-column:1/-1"><div class="empty-icon">🔎</div>No books match your filters.</div>`;
  }

  $("#genre-list").addEventListener("click", (e) => {
    const b = e.target.closest("[data-genre]");
    if (!b) return;
    state.genre = b.dataset.genre;
    renderGenres();
    render();
  });
  $("#q").value = state.q;
  $("#q").addEventListener("input", (e) => { state.q = e.target.value; render(); });
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  range.addEventListener("input", (e) => { state.max = Number(e.target.value); render(); });
  $("#in-stock").addEventListener("change", (e) => { state.inStock = e.target.checked; render(); });

  UI.bindCardActions(grid, () => {
    // Keep the in-memory list in sync so re-renders show the right heart state.
    books.forEach((b) => { const btn = grid.querySelector(`[data-wish="${b.id}"]`); if (btn) b.wished = btn.classList.contains("on"); });
  });
  renderGenres();
  render();
});
