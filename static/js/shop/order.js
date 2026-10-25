// Shared by the confirmation page and "My orders" to draw an order's progress.
const ORDER_FLOW = ["Pending", "Processing", "Shipped", "Delivered"];
function orderTimeline(status) {
  if (status === "Cancelled") return `<p>${UI.statusBadge("Cancelled")}</p>`;
  const at = ORDER_FLOW.indexOf(status);
  return `<div class="timeline">${ORDER_FLOW.map((s, i) => `<div class="${i <= at ? "done" : ""}">${s}</div>`).join("")}</div>`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const root = document.getElementById("receipt");
  if (!root) return;
  const { esc, money } = UI;
  UI.loading(root, "Loading your receipt…");
  let o = null;
  try { o = await Store.order(root.dataset.orderId); } catch (_) { /* shown as not found */ }
  if (!o) {
    root.innerHTML = `<div class="card empty"><div class="empty-icon">🧾</div><h2>Order not found</h2><a class="btn btn-primary" href="/">Back to shop</a></div>`;
    return;
  }
  const p = o.payment;
  const payNote = {
    cash: `Please prepare <strong>${money(o.total)}</strong> for the rider${p.changeFor ? ` (change for ${money(p.changeFor)})` : ""}.`,
    ewallet: `Paid via ${esc(p.provider)} (${esc(p.account || "")}). Reference no. <strong>${esc(p.ref || "")}</strong>.`,
    card: `Charged to your ${esc(p.provider)} card ending in ${esc(p.last4)}.`,
  }[p.method];

  root.innerHTML = `
    <div class="card">
      <div style="text-align:center">
        <div class="success-icon">✓</div>
        <h1>Thank you, ${esc(o.customer.name.split(" ")[0])}!</h1>
        <p class="muted">Your order <strong>#${esc(o.id)}</strong> was placed on ${UI.dateTime(o.createdAt)}.</p>
      </div>
      ${orderTimeline(o.status)}
      <table class="receipt-table">
        <thead><tr><th>Item</th><th class="right">Qty</th><th class="right">Amount</th></tr></thead>
        <tbody>
          ${o.items.map((i) => `<tr><td>${esc(i.title)}<div class="muted small">${money(i.price)} each</div></td><td class="right num">${i.qty}</td><td class="right num">${money(i.price * i.qty)}</td></tr>`).join("")}
        </tbody>
      </table>
      <div class="summary-row"><span>Subtotal</span><span class="num">${money(o.subtotal)}</span></div>
      ${o.discount ? `<div class="summary-row discount"><span>Discount (${esc(o.promoCode)})</span><span class="num">−${money(o.discount)}</span></div>` : ""}
      <div class="summary-row"><span>Shipping</span><span class="num">${o.shipping ? money(o.shipping) : "Free"}</span></div>
      <div class="summary-row total"><span>Total</span><span class="num">${money(o.total)}</span></div>
      <hr>
      <div class="grid-2">
        <div><h3>Deliver to</h3><p class="small">${esc(o.customer.name)}<br>${esc(o.customer.address)}, ${esc(o.customer.city)}<br>${esc(o.customer.phone)}</p></div>
        <div><h3>Payment</h3><p class="small">${UI.paymentLabel(p)}<br>${payNote}</p></div>
      </div>
      <div class="no-print" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:12px">
        <button class="btn btn-ghost" onclick="window.print()">🖨 Print receipt</button>
        <a class="btn btn-ghost" href="/orders">View my orders</a>
        <a class="btn btn-primary" href="/">Continue shopping</a>
      </div>
    </div>`;
});
