document.addEventListener("DOMContentLoaded", () => {
  const { $, esc, money, cover } = UI;
  const root = $("#cart-root");
  let promo = sessionGet("bookstore.promo") || "";
  let cart = null;

  function sessionGet(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } }
  function sessionSet(k, v) { try { v ? sessionStorage.setItem(k, v) : sessionStorage.removeItem(k); } catch (_) {} }

  async function load() {
    try { cart = await Store.cart(promo); render(); }
    catch (err) { UI.handleError(err); }
  }

  function render() {
    const q = cart;
    if (!q.lines.length) {
      root.innerHTML = `<div class="card empty"><div class="empty-icon">🛒</div><h2>Your cart is empty</h2><p>Looks like you haven't added any books yet.</p><a class="btn btn-primary" href="/">Start shopping</a></div>`;
      return;
    }
    const toFree = Store.FREE_SHIPPING_MIN - q.subtotal;
    const promoOk = q.promo && !q.promo.error;
    root.innerHTML = `
      <div class="two-col">
        <div class="card">
          ${q.lines.map((l) => `
            <div class="cart-line">
              <a href="/book/${l.bookId}">${cover(l.book, "cover-sm")}</a>
              <div>
                <h3><a href="/book/${l.bookId}">${esc(l.book.title)}</a></h3>
                <div class="muted small">${esc(l.book.author)} · ${money(l.book.price)} each</div>
                ${l.qty >= l.book.stock ? `<div class="small" style="color:var(--warning)">Max available: ${l.book.stock}</div>` : ""}
                <div class="cart-line-actions">
                  <div class="qty" role="group" aria-label="Quantity for ${esc(l.book.title)}">
                    <button type="button" data-dec="${l.bookId}" aria-label="Decrease">−</button>
                    <input type="number" value="${l.qty}" min="1" max="${l.book.stock}" data-qty="${l.bookId}" aria-label="Quantity">
                    <button type="button" data-inc="${l.bookId}" aria-label="Increase" ${l.qty >= l.book.stock ? "disabled" : ""}>+</button>
                  </div>
                  <button class="link-btn" data-save="${l.bookId}">Save for later</button>
                  <button class="link-btn" data-remove="${l.bookId}">Remove</button>
                </div>
              </div>
              <strong class="num">${money(l.book.price * l.qty)}</strong>
            </div>`).join("")}
          <div style="margin-top:14px"><a href="/">← Continue shopping</a></div>
        </div>

        <aside class="card summary">
          <h2>Order summary</h2>
          ${toFree > 0 ? `<p class="small" style="margin:0">Add <strong>${money(toFree)}</strong> more for free shipping.</p>`
                       : `<p class="small" style="margin:0;color:var(--good)">✓ You've unlocked free shipping!</p>`}
          <div class="ship-progress"><span style="width:${Math.min(100, (q.subtotal / Store.FREE_SHIPPING_MIN) * 100)}%"></span></div>
          <div class="summary-row"><span>Subtotal (${q.count} items)</span><span class="num">${money(q.subtotal)}</span></div>
          ${q.discount ? `<div class="summary-row discount"><span>Discount (${esc(q.promo.code)})</span><span class="num">−${money(q.discount)}</span></div>` : ""}
          <div class="summary-row"><span>Shipping</span><span class="num">${q.shipping ? money(q.shipping) : "Free"}</span></div>
          <div class="summary-row total"><span>Total</span><span class="num">${money(q.total)}</span></div>
          <form class="promo-form" id="promo-form">
            <label for="promo" class="sr-only">Promo code</label>
            <input id="promo" placeholder="Promo code" value="${esc(promo)}" autocomplete="off">
            <button class="btn btn-ghost" type="submit">${promoOk ? "Remove" : "Apply"}</button>
          </form>
          ${q.promo?.error ? `<p class="field-error">${esc(q.promo.error)}</p>` : promoOk ? `<p class="small discount">✓ ${esc(q.promo.label)}</p>` : ""}
          <a class="btn btn-primary btn-block" href="/checkout">Proceed to checkout</a>
          <p class="small muted" style="margin-top:12px;text-align:center">💵 Cash · 📱 E-wallet · 💳 Card</p>
        </aside>
      </div>`;
  }

  const line = (id) => cart.lines.find((l) => l.bookId === Number(id));

  root.addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t || t.type === "submit") return;
    try {
      if (t.dataset.inc) await Store.setCartQty(t.dataset.inc, line(t.dataset.inc).qty + 1);
      else if (t.dataset.dec) {
        const l = line(t.dataset.dec);
        await (l.qty <= 1 ? Store.removeFromCart(t.dataset.dec) : Store.setCartQty(t.dataset.dec, l.qty - 1));
      } else if (t.dataset.remove) { await Store.removeFromCart(t.dataset.remove); UI.toast("Removed from cart"); }
      else if (t.dataset.save) {
        if (!line(t.dataset.save).book.wished) await Store.toggleWishlist(t.dataset.save);
        await Store.removeFromCart(t.dataset.save);
        UI.toast("Moved to wishlist");
      } else return;
      await load();
    } catch (err) { UI.handleError(err); }
  });
  root.addEventListener("change", async (e) => {
    if (!e.target.dataset.qty) return;
    try { await Store.setCartQty(e.target.dataset.qty, Number(e.target.value) || 1); await load(); }
    catch (err) { UI.handleError(err); }
  });
  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    promo = cart.promo && !cart.promo.error ? "" : $("#promo").value.trim().toUpperCase();
    sessionSet("bookstore.promo", promo);
    await load();
  });

  UI.loading(root, "Loading your cart…");
  load();
});
