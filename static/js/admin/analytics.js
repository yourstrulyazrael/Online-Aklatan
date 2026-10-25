document.addEventListener("DOMContentLoaded", async () => {
  const { $, $$, esc, money, cover, stars } = UI;
  const { DAY } = Charts;
  const params = new URLSearchParams(location.search);
  let days = 30;

  let books, orders;
  try { [books, orders] = await Promise.all([Store.adminBooks(), Store.adminOrders()]); }
  catch (err) { UI.handleError(err); return; }
  const byId = (id) => books.find((b) => b.id === Number(id));
  if (!books.length) {
    $(".admin-main").innerHTML = `<div class="card empty"><div class="empty-icon">📚</div><h2>No books yet</h2><a class="btn btn-primary" href="/admin/books">Add your first book</a></div>`;
    return;
  }
  const allOrders = Charts.validOrders(orders);
  const unitsIn = (orders, id) => orders.reduce((s, o) => s + o.items.filter((i) => i.bookId === id).reduce((a, i) => a + i.qty, 0), 0);
  const revenueIn = (orders, id) => orders.reduce((s, o) => s + o.items.filter((i) => i.bookId === id).reduce((a, i) => a + i.qty * i.price, 0), 0);
  const ordersWith = (orders, id) => orders.filter((o) => o.items.some((i) => i.bookId === id)).length;

  let selected = Number(params.get("id")) || [...books].sort((a, b) => unitsIn(allOrders, b.id) - unitsIn(allOrders, a.id))[0].id;
  if (!books.some((b) => b.id === selected)) selected = books[0].id;

  $("#book-select").innerHTML = [...books].sort((a, b) => a.title.localeCompare(b.title))
    .map((b) => `<option value="${b.id}">${esc(b.title)}</option>`).join("");

  function period() {
    const from = Charts.startOfDay(Date.now()) - (days - 1) * DAY;
    return { from, curr: Charts.inRange(allOrders, from), prev: Charts.inRange(allOrders, from - days * DAY, from - 1) };
  }

  let renderToken = 0;
  async function renderBook() {
    const b = byId(selected);
    const token = ++renderToken;
    const { curr, prev } = period();
    $("#book-select").value = b.id;
    history.replaceState(null, "", "?id=" + b.id);

    const r = b.rating;
    $("#book-head").innerHTML = `
      ${cover(b)}
      <div>
        <span class="genre-tag">${esc(b.genre)}</span>
        <h2 style="font-size:1.6rem;margin:.1em 0">${esc(b.title)}</h2>
        <p class="muted" style="margin:0 0 .5em">${esc(b.author)} · ${money(b.price)}${b.isbn ? " · ISBN " + esc(b.isbn) : ""}</p>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${UI.stockBadge(b.stock)} ${stars(r.avg, r.count)}
          <a class="small" href="/book/${b.id}" target="_blank" rel="noopener">View in store ↗</a></div>
      </div>`;

    // ---- KPIs ----
    const units = unitsIn(curr, b.id), unitsPrev = unitsIn(prev, b.id);
    const rev = revenueIn(curr, b.id), revPrev = revenueIn(prev, b.id);
    const views = b.views;
    const conv = views ? (ordersWith(allOrders, b.id) / views) * 100 : 0;
    const last30 = unitsIn(Charts.inRange(allOrders, Date.now() - 30 * DAY), b.id);
    const daily = last30 / 30;
    const cover_ = b.stock <= 0 ? "Out of stock" : daily ? `${Math.floor(b.stock / daily)} days` : "No recent sales";
    const kpi = (label, value, sub, cls = "") => `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-delta ${cls}">${sub}</div></div>`;
    const du = Charts.delta(units, unitsPrev), dr = Charts.delta(rev, revPrev);
    $("#book-kpis").innerHTML =
      kpi("Units sold", units, du.text, du.cls) +
      kpi("Revenue", money(rev), dr.text, dr.cls) +
      kpi("Page views", views.toLocaleString(), "All time") +
      kpi("Conversion", conv.toFixed(1) + "%", "Orders ÷ page views, all time") +
      kpi("Stock cover", cover_, `At ${daily.toFixed(1)} copies/day (last 30 days)`, b.stock <= Store.LOW_STOCK ? "down" : "");

    // ---- Units per day ----
    const unitSeries = Charts.dailySeries(curr, days, (o) => o.items.filter((i) => i.bookId === b.id).reduce((a, i) => a + i.qty, 0));
    $("#units-caption").textContent = `${units} copies · last ${days} days`;
    Charts.draw("units-chart", (t) => ({
      type: "bar",
      data: { labels: unitSeries.labels, datasets: [{ label: "Units sold", data: unitSeries.values, backgroundColor: t.series[0], borderRadius: 4, borderSkipped: "start", maxBarThickness: 18 }] },
      options: Charts.baseOptions(t),
    }));

    // ---- Stock level, rebuilt backwards from today's stock ----
    const [restocks, { reviews }] = await Promise.all([Store.restocks(b.id), Store.book(b.id)]);
    if (token !== renderToken) return; // a newer selection has started rendering
    const stockSeries = unitSeries.buckets.map((dayStart) => {
      const end = dayStart + DAY;
      const soldAfter = allOrders.filter((o) => o.createdAt >= end).reduce((s, o) => s + o.items.filter((i) => i.bookId === b.id).reduce((a, i) => a + i.qty, 0), 0);
      const addedAfter = restocks.filter((x) => x.date >= end).reduce((s, x) => s + x.qty, 0);
      return Math.max(0, b.stock + soldAfter - addedAfter);
    });
    Charts.draw("stock-chart", (t) => ({
      type: "line",
      data: { labels: unitSeries.labels, datasets: [
        { label: "Stock on hand", data: stockSeries, borderColor: t.series[0], borderWidth: 2, stepped: true, pointRadius: 0, pointHoverRadius: 5, fill: false },
        { label: "Low-stock threshold", data: stockSeries.map(() => Store.LOW_STOCK), borderColor: css("--critical"), borderWidth: 1, borderDash: [4, 4], pointRadius: 0, pointHoverRadius: 0 },
      ] },
      options: Charts.baseOptions(t, { plugins: { legend: { display: true, position: "bottom", labels: { color: t.text, boxWidth: 12, boxHeight: 2 } } } }),
    }));

    // ---- Restock history ----
    $("#restock-table").innerHTML = restocks.length
      ? `<thead><tr><th>Date</th><th class="right">Qty</th><th>Note</th></tr></thead><tbody>${restocks.slice(0, 8).map((x) =>
          `<tr><td>${UI.date(x.date)}</td><td class="right num">+${x.qty}</td><td class="muted">${esc(x.note) || "—"}</td></tr>`).join("")}</tbody>`
      : `<tbody><tr><td class="muted">No restocks recorded.</td></tr></tbody>`;

    // ---- Rating distribution ----
    $("#rating-summary").innerHTML = r.count ? `<strong>${r.avg.toFixed(1)}</strong> <span class="muted small">/ 5 · ${r.count} reviews</span>` : "";
    $("#rating-bars").innerHTML = (r.count ? [5, 4, 3, 2, 1].map((n) => {
      const c = reviews.filter((x) => x.rating === n).length;
      return `<div style="display:grid;grid-template-columns:42px 1fr 28px;gap:10px;align-items:center;margin-bottom:6px">
        <span class="small">${n} ★</span><div class="bar-track" style="margin:0"><span style="width:${(c / r.count) * 100}%"></span></div><span class="small num right">${c}</span></div>`;
    }).join("") : `<p class="muted">No reviews yet.</p>`) +
      reviews.slice(0, 3).map((x) => `<div class="review"><div class="review-head"><strong class="small">${esc(x.user)}</strong>${stars(x.rating)}</div><p class="small" style="margin:.2em 0 0">${esc(x.text)}</p></div>`).join("");

    $$("#perf-table tbody tr").forEach((tr) => tr.classList.toggle("selected", Number(tr.dataset.id) === b.id));
  }

  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  // ---- All books table ----
  let perfSort = { key: "units", dir: -1 };
  function perfRows() {
    const { curr } = period();
    return books.map((b) => {
      const views = b.views;
      return {
        id: b.id, title: b.title, author: b.author, stock: b.stock,
        units: unitsIn(curr, b.id), revenue: revenueIn(curr, b.id), views,
        conv: views ? (ordersWith(allOrders, b.id) / views) * 100 : 0, rating: b.rating.avg,
      };
    });
  }
  function renderPerf() {
    const list = perfRows().sort((a, b) => {
      const x = a[perfSort.key], y = b[perfSort.key];
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * perfSort.dir;
    });
    const cols = [["title", "Book"], ["units", "Units"], ["revenue", "Revenue"], ["views", "Views"], ["conv", "Conv."], ["rating", "Rating"], ["stock", "Stock"]];
    $("#perf-table").innerHTML = `<thead><tr>${cols.map(([k, l]) =>
      `<th data-sort="${k}" class="${k !== "title" ? "right" : ""} ${perfSort.key === k ? (perfSort.dir === 1 ? "sorted-asc" : "sorted-desc") : ""}">${l}</th>`).join("")}</tr></thead>
      <tbody>${list.map((r) => `<tr data-id="${r.id}" style="cursor:pointer" class="${r.id === selected ? "selected" : ""}">
        <td><strong>${esc(r.title)}</strong><div class="muted small">${esc(r.author)}</div></td>
        <td class="right num">${r.units}</td><td class="right num">${money(r.revenue)}</td><td class="right num">${r.views.toLocaleString()}</td>
        <td class="right num">${r.conv.toFixed(1)}%</td><td class="right num">${r.rating ? r.rating.toFixed(1) : "—"}</td>
        <td class="right">${r.stock <= Store.LOW_STOCK ? UI.stockBadge(r.stock) : `<span class="num">${r.stock}</span>`}</td></tr>`).join("")}</tbody>`;
  }

  $("#perf-table").addEventListener("click", (e) => {
    const th = e.target.closest("th[data-sort]");
    if (th) {
      perfSort = perfSort.key === th.dataset.sort ? { key: th.dataset.sort, dir: -perfSort.dir } : { key: th.dataset.sort, dir: th.dataset.sort === "title" ? 1 : -1 };
      renderPerf();
      return;
    }
    const tr = e.target.closest("tr[data-id]");
    if (tr) {
      selected = Number(tr.dataset.id);
      renderBook();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
  $("#book-select").addEventListener("change", (e) => { selected = Number(e.target.value); renderBook(); });
  $("#range").addEventListener("click", (e) => {
    const b = e.target.closest("[data-days]");
    if (!b) return;
    days = Number(b.dataset.days);
    $$("#range button").forEach((x) => x.classList.toggle("active", x === b));
    renderPerf();
    renderBook();
  });
  $("#restock-link").addEventListener("click", () => (location.href = "/admin/books?restock=" + selected));
  $("#export-perf").addEventListener("click", () => {
    Charts.downloadCSV(`book-performance-${days}d.csv`, [
      ["ID", "Title", "Author", "Units sold", "Revenue", "Views", "Conversion %", "Avg rating", "Stock"],
      ...perfRows().map((r) => [r.id, r.title, r.author, r.units, r.revenue, r.views, r.conv.toFixed(2), r.rating.toFixed(2), r.stock]),
    ]);
  });

  renderPerf();
  renderBook();
});
