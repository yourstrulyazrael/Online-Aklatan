document.addEventListener("DOMContentLoaded", async () => {
  const { $, esc, money } = UI;
  const STATUSES = ["Pending", "Processing", "Shipped", "Delivered", "Cancelled"];
  const PAGE = 15;
  const state = { q: "", status: "", method: "", page: 0 };
  let all = [];
  const byId = (id) => all.find((o) => o.id === id);

  async function load() {
    try { all = await Store.adminOrders(); render(); }
    catch (err) { UI.handleError(err); }
  }

  function filtered() {
    const q = state.q.trim().toLowerCase();
    return all.filter((o) =>
      (!state.status || o.status === state.status) &&
      (!state.method || o.payment.method === state.method) &&
      (!q || o.id.toLowerCase().includes(q) || o.customer.name.toLowerCase().includes(q) ||
        (o.userEmail || "").toLowerCase().includes(q) || o.items.some((i) => i.title.toLowerCase().includes(q))));
  }

  function statusSelect(o) {
    if (o.status === "Cancelled") return UI.statusBadge("Cancelled");
    return `<select data-status="${esc(o.id)}" aria-label="Status for order ${esc(o.id)}" style="width:auto;padding:.3em .5em;font-size:.85rem">
      ${STATUSES.map((s) => `<option ${s === o.status ? "selected" : ""}>${s}</option>`).join("")}</select>`;
  }

  function render() {
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    state.page = Math.min(state.page, pages - 1);
    const slice = list.slice(state.page * PAGE, state.page * PAGE + PAGE);

    const pending = all.filter((o) => o.status === "Pending" || o.status === "Processing").length;
    $("#orders-summary").textContent = `${all.length} orders · ${pending} awaiting fulfilment`;

    $("#orders-body").innerHTML = slice.length ? slice.map((o) => `<tr>
      <td><strong class="small">#${esc(o.id)}</strong><div class="muted small">${UI.dateTime(o.createdAt)}</div></td>
      <td>${esc(o.customer.name)}<div class="muted small">${esc(o.customer.city)}</div></td>
      <td class="small">${o.items.reduce((s, i) => s + i.qty, 0)} × ${o.items.length === 1 ? esc(o.items[0].title) : o.items.length + " titles"}</td>
      <td class="small">${UI.paymentLabel(o.payment)}</td>
      <td class="right num">${money(o.total)}</td>
      <td>${statusSelect(o)}</td>
      <td><button class="btn btn-ghost btn-sm" data-view="${esc(o.id)}">Details</button></td>
    </tr>`).join("") : `<tr><td colspan="7" class="empty">No orders match these filters.</td></tr>`;

    $("#page-info").textContent = list.length ? `Showing ${state.page * PAGE + 1}–${state.page * PAGE + slice.length} of ${list.length}` : "";
    $("#prev-page").disabled = state.page === 0;
    $("#next-page").disabled = state.page >= pages - 1;
  }

  function showOrder(id) {
    const o = byId(id);
    $("#order-modal-title").textContent = "Order #" + o.id;
    $("#order-detail").innerHTML = `
      <p>${UI.statusBadge(o.status)} <span class="muted small">${UI.dateTime(o.createdAt)}</span></p>
      <div class="grid-2">
        <div><h3>Customer</h3><p class="small">${esc(o.customer.name)}<br>${esc(o.userEmail || o.customer.email || "")}<br>${esc(o.customer.phone)}<br>${esc(o.customer.address)}, ${esc(o.customer.city)}${o.customer.notes ? `<br><em>“${esc(o.customer.notes)}”</em>` : ""}</p></div>
        <div><h3>Payment</h3><p class="small">${UI.paymentLabel(o.payment)}${o.payment.changeFor ? `<br>Change for ${money(o.payment.changeFor)}` : ""}</p></div>
      </div>
      <table class="receipt-table">
        <thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Amount</th></tr></thead>
        <tbody>${o.items.map((i) => `<tr><td>${esc(i.title)}</td><td class="right num">${i.qty}</td><td class="right num">${money(i.qty * i.price)}</td></tr>`).join("")}</tbody>
      </table>
      <div class="summary-row"><span>Subtotal</span><span class="num">${money(o.subtotal)}</span></div>
      ${o.discount ? `<div class="summary-row discount"><span>Discount (${esc(o.promoCode)})</span><span class="num">−${money(o.discount)}</span></div>` : ""}
      <div class="summary-row"><span>Shipping</span><span class="num">${o.shipping ? money(o.shipping) : "Free"}</span></div>
      <div class="summary-row total"><span>Total</span><span class="num">${money(o.total)}</span></div>`;
    UI.openModal("order-modal");
  }

  $("#orders-body").addEventListener("change", async (e) => {
    const sel = e.target.closest("[data-status]");
    if (!sel) return;
    const id = sel.dataset.status;
    const prev = byId(id).status;
    if (sel.value === "Cancelled" && !(await UI.confirmDialog("Cancel this order? Its items will be returned to inventory. This can't be undone.", "Cancel order"))) {
      sel.value = prev;
      return;
    }
    try {
      await Store.updateOrderStatus(id, sel.value);
      UI.toast(`Order #${id} → ${sel.value}`, "good");
      await load();
    } catch (err) { UI.handleError(err); sel.value = prev; }
  });
  $("#orders-body").addEventListener("click", (e) => {
    const v = e.target.closest("[data-view]");
    if (v) showOrder(v.dataset.view);
  });

  $("#o-q").addEventListener("input", (e) => { state.q = e.target.value; state.page = 0; render(); });
  $("#o-status").addEventListener("change", (e) => { state.status = e.target.value; state.page = 0; render(); });
  $("#o-method").addEventListener("change", (e) => { state.method = e.target.value; state.page = 0; render(); });
  $("#prev-page").addEventListener("click", () => { state.page--; render(); });
  $("#next-page").addEventListener("click", () => { state.page++; render(); });
  $("#export-orders").addEventListener("click", () => {
    Charts.downloadCSV("orders.csv", [
      ["Order", "Date", "Customer", "Email", "City", "Items", "Subtotal", "Discount", "Shipping", "Total", "Payment", "Provider", "Status"],
      ...filtered().map((o) => [o.id, new Date(o.createdAt).toISOString(), o.customer.name, o.userEmail, o.customer.city,
        o.items.map((i) => `${i.title} x${i.qty}`).join("; "), o.subtotal, o.discount, o.shipping, o.total, o.payment.method, o.payment.provider, o.status]),
    ]);
  });

  $("#orders-body").innerHTML = `<tr><td colspan="7"><div class="loading"><div class="spinner"></div></div></td></tr>`;
  load();
});
