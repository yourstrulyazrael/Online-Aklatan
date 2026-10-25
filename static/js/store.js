/*
 * Store — client for the Flask JSON API (api.py). Every method returns a Promise.
 * The signed-in user, cart count and store settings come from the page itself
 * (#client-state, rendered by app.py) so the header can draw without a request.
 */
const Store = (() => {
  const el = document.getElementById("client-state");
  const state = el ? JSON.parse(el.textContent) : { user: null, cartCount: 0, config: {} };

  class AuthRequired extends Error {}

  async function api(path, { method = "GET", body } = {}) {
    const write = method !== "GET";
    // The API only accepts JSON for writes (its CSRF guard), so always send a JSON body.
    const res = await fetch("/api" + path, {
      method,
      headers: write ? { "Content-Type": "application/json" } : {},
      body: write ? JSON.stringify(body ?? {}) : undefined,
      credentials: "same-origin",
    });
    let data = {};
    try { data = await res.json(); } catch (_) { /* empty body */ }
    if (res.status === 401) throw new AuthRequired(data.error || "Please sign in to continue.");
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
    return data;
  }

  function setCount(n) {
    state.cartCount = n;
    document.dispatchEvent(new CustomEvent("cartchange", { detail: n }));
  }

  return {
    AuthRequired,
    SHIPPING_FEE: state.config.SHIPPING_FEE,
    FREE_SHIPPING_MIN: state.config.FREE_SHIPPING_MIN,
    LOW_STOCK: state.config.LOW_STOCK,

    // ---------- Auth ----------
    currentUser: () => state.user,
    cartCount: () => state.cartCount,
    async login(email, password) { return (await api("/login", { method: "POST", body: { email, password } })).user; },
    async register(data) { return (await api("/register", { method: "POST", body: data })).user; },
    async logout() { await api("/logout", { method: "POST" }); },

    // ---------- Catalog ----------
    async books() { return (await api("/books")).books; },
    async book(id) { return api(`/books/${id}`); },            // { book, reviews }
    trackView(id) { return api(`/books/${id}/view`, { method: "POST" }).catch(() => {}); },
    addReview(id, rating, text) { return api(`/books/${id}/reviews`, { method: "POST", body: { rating, text } }); },

    // ---------- Cart ----------
    async cart(promo = "") {
      const c = await api("/cart" + (promo ? "?promo=" + encodeURIComponent(promo) : ""));
      setCount(c.count);
      return c;
    },
    async addToCart(bookId, qty = 1) { setCount((await api("/cart", { method: "POST", body: { bookId: Number(bookId), qty } })).count); },
    async setCartQty(bookId, qty) { setCount((await api(`/cart/${bookId}`, { method: "PATCH", body: { qty } })).count); },
    async removeFromCart(bookId) { setCount((await api(`/cart/${bookId}`, { method: "DELETE" })).count); },

    // ---------- Wishlist ----------
    async wishlist() { return (await api("/wishlist")).books; },
    async toggleWishlist(bookId) { return (await api(`/wishlist/${bookId}/toggle`, { method: "POST" })).wished; },

    // ---------- Orders ----------
    async placeOrder(payload) {
      const { order } = await api("/orders", { method: "POST", body: payload });
      setCount(0);
      return order;
    },
    async order(id) { return (await api(`/orders/${encodeURIComponent(id)}`)).order; },
    async myOrders() { return (await api("/orders")).orders; },
    async cancelMyOrder(id) { return (await api(`/orders/${encodeURIComponent(id)}/cancel`, { method: "POST" })).order; },

    // ---------- Admin ----------
    async adminBooks() { return (await api("/admin/books")).books; },
    saveBook(data) {
      return data.id ? api(`/admin/books/${data.id}`, { method: "PUT", body: data }) : api("/admin/books", { method: "POST", body: data });
    },
    deleteBook(id) { return api(`/admin/books/${id}`, { method: "DELETE" }); },
    restock(id, qty, note) { return api(`/admin/books/${id}/restock`, { method: "POST", body: { qty: Number(qty), note } }); },
    discardUpload(url) { return api("/admin/uploads/cover", { method: "DELETE", body: { url } }).catch(() => {}); },
    setCover(id, coverUrl) { return api(`/admin/books/${id}/cover`, { method: "PATCH", body: { coverUrl } }); },

    // Uploads an image file and resolves to { url }. Uses XHR (not fetch) to report upload progress.
    uploadCover(file, onProgress) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const form = new FormData();
        form.append("image", file);
        xhr.open("POST", "/api/admin/uploads/cover");
        xhr.setRequestHeader("X-Requested-With", "fetch"); // the API's CSRF check for non-JSON writes
        xhr.responseType = "json";
        if (onProgress) xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
        xhr.onload = () => {
          const data = xhr.response || {};
          if (xhr.status === 401) reject(new AuthRequired(data.error || "Please sign in to continue."));
          else if (xhr.status >= 400) reject(new Error(data.error || `Upload failed (${xhr.status}).`));
          else resolve(data);
        };
        xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
        xhr.send(form);
      });
    },
    async restocks(id) { return (await api(`/admin/books/${id}/restocks`)).restocks; },
    async adminOrders() { return (await api("/admin/orders")).orders; },
    updateOrderStatus(id, status) { return api(`/admin/orders/${encodeURIComponent(id)}`, { method: "PATCH", body: { status } }); },
  };
})();
