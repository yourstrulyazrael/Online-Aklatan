document.addEventListener("DOMContentLoaded", async () => {
  const { $, esc, money } = UI;
  const root = $("#orders-root");
  let filter = "all";
  let all = [];
  const covers = {};

  async function load() {
    try {
      [all] = await Promise.all([Store.myOrders(), Store.books().then((bs) => bs.forEach((b) => (covers[b.id] = b)))]);
      render();
    } catch (err) { UI.handleError(err); }
  }

  function render() {
    const orders = all.filter((o) =>
      filter === "all" || (filter === "active" ? !["Delivered", "Cancelled"].includes(o.status) : o.status === filter));
    if (!orders.length) {
      root.innerHTML = `<div class="card empty"><div class="empty-icon">📦</div><h2>No orders here yet</h2><a class="btn btn-primary" href="/">Start shopping</a></div>`;
      return;
    }
    root.innerHTML = orders.map((o) => `
      <div class="card order-card">
        <div class="order-head">
          <div><strong>#${esc(o.id)}</strong><div class="muted small">${UI.dateTime(o.createdAt)} · ${UI.paymentLabel(o.payment)}</div></div>
          <div style="text-align:right">${UI.statusBadge(o.status)}<div class="num" style="font-weight:700;margin-top:4px">${money(o.total)}</div></div>
        </div>
        <div class="order-items">
          ${o.items.map((i) => {
            const b = covers[i.bookId];
            return `<a href="${b ? "/book/" + i.bookId : "#"}" style="display:flex;gap:8px;align-items:center;color:inherit">
              ${b ? UI.cover(b, "cover-xs") : ""}<span class="small">${esc(i.title)}<br><span class="muted">× ${i.qty}</span></span></a>`;
          }).join("")}
        </div>
        ${orderTimeline(o.status)}
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
          <a class="btn btn-ghost btn-sm" href="/order/${esc(o.id)}">View receipt</a>
          <button class="btn btn-ghost btn-sm" data-reorder="${esc(o.id)}">Buy again</button>
          ${["Pending", "Processing"].includes(o.status) ? `<button class="btn btn-ghost btn-sm" data-cancel="${esc(o.id)}" style="color:var(--critical)">Cancel order</button>` : ""}
        </div>
      </div>`).join("");
  }

  root.addEventListener("click", async (e) => {
    const c = e.target.closest("[data-cancel]");
    if (c && await UI.confirmDialog("Cancel this order? Items will be returned to stock.", "Cancel order")) {
      try { await Store.cancelMyOrder(c.dataset.cancel); UI.toast("Order cancelled"); await load(); }
      catch (err) { UI.handleError(err); }
    }
    const r = e.target.closest("[data-reorder]");
    if (r) {
      const o = all.find((x) => x.id === r.dataset.reorder);
      const skipped = [];
      for (const i of o.items) {
        try { await Store.addToCart(i.bookId, i.qty); } catch (_) { skipped.push(i.title); }
      }
      UI.toast(skipped.length ? `Added to cart. Unavailable: ${skipped.join(", ")}` : "Items added to cart", skipped.length ? "info" : "good");
    }
  });

  $("#order-filter").addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    filter = b.dataset.f;
    UI.$$("#order-filter button").forEach((x) => x.classList.toggle("active", x === b));
    render();
  });

  UI.loading(root, "Loading your orders…");
  load();
});
