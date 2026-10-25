document.addEventListener("DOMContentLoaded", async () => {
  const { $, $$, esc, money } = UI;
  const { DAY } = Charts;
  let days = 30;

  const user = Store.currentUser();
  const hour = new Date().getHours();
  $("#greeting").textContent = `Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, ${user.name}. Here's how the store is doing.`;

  let orders, books;
  try { [orders, books] = await Promise.all([Store.adminOrders(), Store.adminBooks()]); }
  catch (err) { UI.handleError(err); return; }

  function render() {
    const all = Charts.validOrders(orders);
    const now = Date.now();
    const from = Charts.startOfDay(now) - (days - 1) * DAY;
    const curr = Charts.inRange(all, from, now);
    const prev = Charts.inRange(all, from - days * DAY, from - 1);

    // ---- KPIs ----
    const sum = (list, fn) => list.reduce((s, o) => s + fn(o), 0);
    const units = (o) => o.items.reduce((s, i) => s + i.qty, 0);
    const rev = sum(curr, (o) => o.total), revPrev = sum(prev, (o) => o.total);
    const u = sum(curr, units), uPrev = sum(prev, units);
    const aov = curr.length ? rev / curr.length : 0, aovPrev = prev.length ? revPrev / prev.length : 0;
    const lowCount = books.filter((b) => b.stock <= Store.LOW_STOCK).length;
    const kpi = (label, value, d) => `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-delta ${d.cls}">${d.text}</div></div>`;
    $("#kpis").innerHTML =
      kpi("Revenue", money(rev), Charts.delta(rev, revPrev)) +
      kpi("Orders", curr.length.toLocaleString(), Charts.delta(curr.length, prev.length)) +
      kpi("Books sold", u.toLocaleString(), Charts.delta(u, uPrev)) +
      kpi("Avg. order value", money(aov), Charts.delta(aov, aovPrev)) +
      kpi("Titles in catalog", books.length, { text: lowCount ? `⚠ ${lowCount} low or out of stock` : "✓ All well stocked", cls: lowCount ? "down" : "up" });

    // ---- Revenue line ----
    const series = Charts.dailySeries(curr, days, (o) => o.total);
    $("#rev-caption").textContent = `Last ${days} days · ${money(rev)}`;
    Charts.draw("rev-chart", (t) => ({
      type: "line",
      data: { labels: series.labels, datasets: [{
        label: "Revenue", data: series.values, borderColor: t.series[0], backgroundColor: t.series[0] + "22",
        fill: true, cubicInterpolationMode: "monotone", borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2, pointHoverBorderColor: t.surface,
      }] },
      options: Charts.baseOptions(t, {
        plugins: { tooltip: { callbacks: { label: (c) => " " + money(c.parsed.y) } } },
        scales: { y: { ticks: { callback: (v) => "₱" + Number(v).toLocaleString() } } },
      }),
    }));

    // ---- Payment methods ----
    const methods = [["cash", "Cash (COD)"], ["ewallet", "E-Wallet"], ["card", "Card"]];
    const payRev = methods.map(([m]) => sum(curr.filter((o) => o.payment.method === m), (o) => o.total));
    const payCount = methods.map(([m]) => curr.filter((o) => o.payment.method === m).length);
    Charts.draw("pay-chart", (t) => ({
      type: "bar",
      data: { labels: methods.map((m) => m[1]), datasets: [{ label: "Revenue", data: payRev, backgroundColor: t.series.slice(0, 3), borderRadius: 4, borderSkipped: "start", barPercentage: 0.6 }] },
      options: Charts.baseOptions(t, {
        indexAxis: "y",
        layout: { padding: { left: 4 } },
        interaction: { mode: "nearest", intersect: false, axis: "y" },
        plugins: { tooltip: { callbacks: { label: (c) => ` ${money(c.parsed.x)} · ${payCount[c.dataIndex]} orders` } } },
        scales: {
          x: { beginAtZero: true, grid: { display: true, color: t.grid }, border: { display: false }, ticks: { callback: (v) => "₱" + Number(v / 1000).toLocaleString() + "k" } },
          y: { beginAtZero: false, grid: { display: false }, border: { display: true, color: t.grid }, ticks: { color: t.text } },
        },
      }),
    }));
    $("#pay-table").innerHTML = `<table class="data"><tbody>${methods.map(([, label], i) =>
      `<tr><td>${label}</td><td class="right num">${payCount[i]} orders</td><td class="right num">${rev ? ((payRev[i] / rev) * 100).toFixed(0) : 0}%</td></tr>`).join("")}</tbody></table>`;

    // ---- Units by genre ----
    const genreUnits = {};
    const bookGenre = Object.fromEntries(books.map((b) => [b.id, b.genre]));
    curr.forEach((o) => o.items.forEach((i) => {
      const g = bookGenre[i.bookId] || "Removed titles";
      genreUnits[g] = (genreUnits[g] || 0) + i.qty;
    }));
    const genres = Object.entries(genreUnits).sort((a, b) => b[1] - a[1]);
    Charts.draw("genre-chart", (t) => ({
      type: "bar",
      data: { labels: genres.map((g) => g[0]), datasets: [{ label: "Units sold", data: genres.map((g) => g[1]), backgroundColor: t.series[0], borderRadius: 4, borderSkipped: "start", maxBarThickness: 36 }] },
      options: Charts.baseOptions(t),
    }));

    // ---- Top sellers ----
    const byBook = {};
    curr.forEach((o) => o.items.forEach((i) => {
      byBook[i.bookId] ||= { id: i.bookId, title: i.title, units: 0, revenue: 0 };
      byBook[i.bookId].units += i.qty;
      byBook[i.bookId].revenue += i.qty * i.price;
    }));
    const top = Object.values(byBook).sort((a, b) => b.units - a.units).slice(0, 6);
    const maxUnits = top[0]?.units || 1;
    $("#top-sellers").innerHTML = top.length ? top.map((b, i) => `
      <li><span class="rank">${i + 1}</span>
        <div class="grow"><a href="/admin/analytics?id=${b.id}" style="color:inherit"><strong>${esc(b.title)}</strong></a>
          <div class="bar-track"><span style="width:${(b.units / maxUnits) * 100}%"></span></div></div>
        <div class="right"><strong class="num">${b.units}</strong><div class="muted small num">${money(b.revenue)}</div></div></li>`).join("")
      : `<li class="muted">No sales in this period.</li>`;

    // ---- Recent orders ----
    const recent = orders.slice(0, 6);
    $("#recent-orders").innerHTML = `<thead><tr><th>Order</th><th>Customer</th><th>Payment</th><th>Status</th><th class="right">Total</th></tr></thead><tbody>${
      recent.map((o) => `<tr><td><strong class="small">#${esc(o.id)}</strong><div class="muted small">${UI.date(o.createdAt)}</div></td>
        <td>${esc(o.customer.name)}</td><td class="small">${UI.paymentLabel(o.payment)}</td><td>${UI.statusBadge(o.status)}</td>
        <td class="right num">${money(o.total)}</td></tr>`).join("")}</tbody>`;

    // ---- Stock alerts ----
    const alerts = books.filter((b) => b.stock <= Store.LOW_STOCK).sort((a, b) => a.stock - b.stock);
    $("#stock-alerts").innerHTML = alerts.length ? alerts.map((b) => `
      <li><div class="grow"><strong>${esc(b.title)}</strong><span class="muted small">${esc(b.author)}</span></div>
        ${UI.stockBadge(b.stock)}
        <a class="btn btn-ghost btn-sm" href="/admin/books?restock=${b.id}">Restock</a></li>`).join("")
      : `<li class="muted">✓ Every title is well stocked.</li>`;
  }

  $("#range").addEventListener("click", (e) => {
    const b = e.target.closest("[data-days]");
    if (!b) return;
    days = Number(b.dataset.days);
    $$("#range button").forEach((x) => x.classList.toggle("active", x === b));
    render();
  });

  render();
});
