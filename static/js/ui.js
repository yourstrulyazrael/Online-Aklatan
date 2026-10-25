/* Shared UI helpers used by every page. */
const UI = (() => {
  const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
  const dateFmt = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" });
  const dateTimeFmt = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function money(n) { return peso.format(n || 0); }
  function date(ts) { return dateFmt.format(new Date(ts)); }
  function dateTime(ts) { return dateTimeFmt.format(new Date(ts)); }

  // The generated cover sits underneath; a real cover image covers it when one loads.
  function cover(book, size = "") {
    const [a, b] = book.cover || ["#333", "#666"];
    const img = book.coverUrl
      ? `<img src="${esc(book.coverUrl)}" alt="" loading="lazy" onerror="this.remove()">`
      : "";
    return `<div class="cover ${size}" style="--c1:${esc(a)};--c2:${esc(b)}" role="img" aria-label="Cover of ${esc(book.title)}">
      <span class="cover-title">${esc(book.title)}</span>
      <span class="cover-author">${esc(book.author)}</span>
      ${img}
    </div>`;
  }

  function stars(avg, count) {
    const full = Math.round(avg || 0);
    const s = "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
    return `<span class="stars" aria-label="${(avg || 0).toFixed(1)} out of 5">${s}</span>` +
      (count !== undefined ? ` <span class="muted small">(${count})</span>` : "");
  }

  function stockBadge(stock) {
    if (stock <= 0) return `<span class="badge badge-critical">Out of stock</span>`;
    if (stock <= Store.LOW_STOCK) return `<span class="badge badge-warning">Only ${stock} left</span>`;
    return `<span class="badge badge-good">In stock</span>`;
  }

  function statusBadge(status) {
    const cls = { Pending: "warning", Processing: "info", Shipped: "info", Delivered: "good", Cancelled: "critical" }[status] || "neutral";
    return `<span class="badge badge-${cls}">${esc(status)}</span>`;
  }

  function paymentLabel(p) {
    if (!p) return "";
    if (p.method === "card") return `${esc(p.provider)} •••• ${esc(p.last4)}`;
    if (p.method === "ewallet") return `${esc(p.provider)}${p.ref ? " · " + esc(p.ref) : ""}`;
    return "Cash on Delivery";
  }

  function toast(msg, type = "info") {
    let wrap = $("#toasts");
    if (!wrap) { wrap = document.createElement("div"); wrap.id = "toasts"; wrap.setAttribute("aria-live", "polite"); document.body.append(wrap); }
    while (wrap.children.length >= 3) wrap.firstElementChild.remove(); // keep at most three on screen
    const t = document.createElement("div");
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    wrap.append(t);
    setTimeout(() => t.classList.add("out"), 2800);
    setTimeout(() => t.remove(), 3200);
  }

  function loading(el, text = "Loading…") {
    el.innerHTML = `<div class="loading"><div class="spinner"></div><span class="muted">${esc(text)}</span></div>`;
  }

  // ---------- Modals ----------
  function openModal(id) {
    const m = document.getElementById(id);
    m.hidden = false;
    document.body.classList.add("no-scroll");
    const f = m.querySelector("input, select, textarea, button:not(.modal-close)");
    if (f) setTimeout(() => f.focus(), 30);
  }
  function closeModal(id) {
    const m = typeof id === "string" ? document.getElementById(id) : id;
    if (m.hidden) return;
    m.hidden = true;
    document.body.classList.remove("no-scroll");
    m.dispatchEvent(new CustomEvent("modalclose"));
  }
  function confirmDialog(message, okLabel = "Confirm", danger = true) {
    return new Promise((resolve) => {
      const m = document.createElement("div");
      m.className = "modal";
      m.innerHTML = `<div class="modal-card modal-sm" role="dialog" aria-modal="true">
        <p>${esc(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-r="0">Cancel</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-r="1">${esc(okLabel)}</button>
        </div></div>`;
      document.body.append(m);
      m.querySelector('[data-r="1"]').focus();
      m.addEventListener("click", (e) => {
        const r = e.target.closest("[data-r]");
        if (r || e.target === m) { m.remove(); resolve(r ? r.dataset.r === "1" : false); }
      });
    });
  }

  // Shown when a guest tries to buy, add to cart or save a book.
  function signInModal(reason = "buy books") {
    $$(".signin-modal").forEach((m) => m.remove());
    const next = encodeURIComponent(location.pathname + location.search);
    const m = document.createElement("div");
    m.className = "modal signin-modal";
    m.innerHTML = `<div class="modal-card modal-sm signin-card" role="dialog" aria-modal="true" aria-labelledby="signin-title">
      <button class="icon-btn modal-close" data-dismiss aria-label="Close">✕</button>
      <div class="signin-icon">🔒</div>
      <h2 id="signin-title">Sign in to continue</h2>
      <p class="muted">You need an account to ${esc(reason)}. It only takes a minute, and your cart, wishlist and orders are saved to it.</p>
      <div class="signin-actions">
        <a class="btn btn-primary btn-block" href="/login?next=${next}">Log in</a>
        <a class="btn btn-ghost btn-block" href="/login?tab=register&next=${next}">Create an account</a>
      </div>
      <button class="link-btn" data-dismiss>Keep browsing</button>
    </div>`;
    document.body.append(m);
    document.body.classList.add("no-scroll");
    const close = () => { m.remove(); document.body.classList.remove("no-scroll"); };
    m.addEventListener("click", (e) => { if (e.target === m || e.target.closest("[data-dismiss]")) close(); });
    m.querySelector(".btn-primary").focus();
  }

  // Runs `fn` only for signed-in users; guests get the sign-in modal instead.
  function requireSignIn(reason, fn) {
    if (!Store.currentUser()) { signInModal(reason); return false; }
    return fn();
  }

  function handleError(err) {
    if (err instanceof Store.AuthRequired) signInModal();
    else toast(err.message || "Something went wrong.", "critical");
  }

  // ---------- Theme ----------
  function applyTheme(t) {
    if (t) document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }
  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem("bookstore.theme"); } catch (_) {}
    applyTheme(saved);
    $$("[data-theme-toggle]").forEach((btn) => btn.addEventListener("click", () => {
      const dark = document.documentElement.dataset.theme === "dark" ||
        (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
      const next = dark ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem("bookstore.theme", next); } catch (_) {}
      document.dispatchEvent(new CustomEvent("themechange"));
    }));
  }

  // ---------- Header ----------
  function refreshCartBadge() {
    const n = Store.cartCount();
    $$("[data-cart-count]").forEach((el) => { el.textContent = n; el.hidden = n === 0; });
  }

  async function logout() {
    try { await Store.logout(); } finally { location.href = "/"; }
  }

  function renderUserMenu() {
    const slot = $("#user-menu");
    if (!slot) return;
    const u = Store.currentUser();
    if (!u) {
      slot.innerHTML = `<a class="btn btn-ghost btn-sm" href="/login?next=${encodeURIComponent(location.pathname)}">Log in</a>
        <a class="btn btn-primary btn-sm hide-sm" href="/login?tab=register">Sign up</a>`;
      return;
    }
    slot.innerHTML = `
      <details class="dropdown">
        <summary class="avatar" title="${esc(u.name)}">${esc(u.name.split(" ").map((p) => p[0]).slice(0, 2).join(""))}</summary>
        <div class="dropdown-menu">
          <div class="dropdown-head"><strong>${esc(u.name)}</strong><span class="muted small">${esc(u.email)}</span></div>
          ${u.role === "admin" ? `<a href="/admin">Admin dashboard</a>` : ""}
          <a href="/orders">My orders</a>
          <a href="/wishlist">Wishlist</a>
          <button type="button" data-logout>Log out</button>
        </div>
      </details>`;
    $("[data-logout]", slot).addEventListener("click", logout);
  }

  // Book card used on the catalog, wishlist and "related" rows.
  function bookCard(b) {
    const r = b.rating || { avg: 0, count: 0 };
    return `<article class="book-card">
      <a href="/book/${b.id}" class="book-card-cover">${cover(b)}</a>
      <button class="wish-btn ${b.wished ? "on" : ""}" data-wish="${b.id}" aria-pressed="${!!b.wished}" aria-label="${b.wished ? "Remove from" : "Add to"} wishlist">♥</button>
      <div class="book-card-body">
        <span class="genre-tag">${esc(b.genre)}</span>
        <h3><a href="/book/${b.id}">${esc(b.title)}</a></h3>
        <p class="muted small">${esc(b.author)}</p>
        <div class="small">${stars(r.avg, r.count)}</div>
        <div class="book-card-foot">
          <strong class="price">${money(b.price)}</strong>
          <button class="btn btn-primary btn-sm" data-add="${b.id}" ${b.stock <= 0 ? "disabled" : ""}>${b.stock <= 0 ? "Sold out" : "Add to cart"}</button>
        </div>
      </div>
    </article>`;
  }

  // Delegated handlers for [data-add] and [data-wish] buttons anywhere inside `root`.
  function bindCardActions(root, onWishChange) {
    root.addEventListener("click", async (e) => {
      const add = e.target.closest("[data-add]");
      if (add) {
        requireSignIn("add books to your cart", async () => {
          add.disabled = true;
          try { await Store.addToCart(add.dataset.add); toast("Added to cart", "good"); }
          catch (err) { handleError(err); }
          finally { add.disabled = false; }
        });
      }
      const wish = e.target.closest("[data-wish]");
      if (wish) {
        requireSignIn("save books to your wishlist", async () => {
          try {
            const on = await Store.toggleWishlist(wish.dataset.wish);
            wish.classList.toggle("on", on);
            wish.setAttribute("aria-pressed", on);
            toast(on ? "Saved to wishlist" : "Removed from wishlist");
            if (onWishChange) onWishChange();
          } catch (err) { handleError(err); }
        });
      }
    });
  }

  document.addEventListener("cartchange", refreshCartBadge);
  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    refreshCartBadge();
    renderUserMenu();
    // Guests see the sign-in prompt instead of an empty cart page.
    $$("[data-cart-link]").forEach((a) => a.addEventListener("click", (e) => {
      if (!Store.currentUser()) { e.preventDefault(); signInModal("view your cart and buy books"); }
    }));
    $$("[data-logout]").forEach((b) => b.addEventListener("click", logout));
    // Close modals via [data-close] or backdrop click / Escape.
    document.addEventListener("click", (e) => {
      const c = e.target.closest("[data-close]");
      if (c) closeModal(c.closest(".modal"));
      else if (e.target.classList && e.target.classList.contains("modal") && e.target.id) closeModal(e.target);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      $$(".modal:not([hidden])").forEach((m) => (m.id ? closeModal(m) : m.remove()));
      document.body.classList.remove("no-scroll");
    });
    // Highlight the current nav link.
    $$(".nav-links a, .side-nav a, .mobile-nav a").forEach((a) => {
      if (a.getAttribute("href") === location.pathname) a.classList.add("active");
    });
  });

  return {
    $, $$, esc, money, date, dateTime, cover, stars, stockBadge, statusBadge, paymentLabel, loading,
    toast, openModal, closeModal, confirmDialog, signInModal, requireSignIn, handleError,
    refreshCartBadge, bookCard, bindCardActions,
  };
})();
