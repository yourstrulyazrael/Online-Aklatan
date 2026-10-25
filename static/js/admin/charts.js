/* Chart + analytics helpers shared by the admin pages. */
const Charts = (() => {
  const DAY = 86400000;
  const instances = new Map();
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function theme() {
    return {
      text: css("--text-2"), muted: css("--chart-axis"), grid: css("--chart-grid"), surface: css("--surface"),
      series: [css("--series-1"), css("--series-2"), css("--series-3"), css("--series-4")],
    };
  }

  function merge(base, extra) {
    for (const [k, v] of Object.entries(extra)) {
      base[k] = v && typeof v === "object" && !Array.isArray(v) && typeof base[k] === "object" ? merge(base[k], v) : v;
    }
    return base;
  }

  // Default options for every chart; `extra` is deep-merged on top.
  function baseOptions(t, extra = {}) {
    return merge({
      responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: t.surface, titleColor: css("--text"), bodyColor: t.text, borderColor: t.grid, borderWidth: 1,
          padding: 10, boxPadding: 4, usePointStyle: true,
        },
      },
      scales: {
        x: { grid: { display: false }, border: { color: t.grid }, ticks: { color: t.muted, maxRotation: 0, autoSkipPadding: 16 } },
        y: { beginAtZero: true, grid: { color: t.grid }, border: { display: false }, ticks: { color: t.muted, precision: 0 } },
      },
    }, extra);
  }

  // Create (or replace) a chart on a canvas. `build(theme)` returns a Chart.js config,
  // so it can be rebuilt with fresh colors when the theme changes.
  function draw(canvasId, build) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === "undefined") return;
    if (instances.has(canvasId)) instances.get(canvasId).chart.destroy();
    Chart.defaults.font.family = css("--font-body");
    const chart = new Chart(canvas, build(theme()));
    instances.set(canvasId, { chart, build });
  }

  document.addEventListener("themechange", () => {
    instances.forEach(({ build }, id) => draw(id, build));
  });

  // ---------- Analytics helpers ----------
  const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

  function dayBuckets(days) {
    const today = startOfDay(Date.now());
    return Array.from({ length: days }, (_, i) => today - (days - 1 - i) * DAY);
  }

  function dayLabel(ts) {
    return new Date(ts).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  }

  // Sum `valueFn(order)` per day over the last `days` days.
  function dailySeries(orders, days, valueFn) {
    const buckets = dayBuckets(days);
    const idx = new Map(buckets.map((b, i) => [b, i]));
    const values = new Array(days).fill(0);
    orders.forEach((o) => {
      const i = idx.get(startOfDay(o.createdAt));
      if (i !== undefined) values[i] += valueFn(o);
    });
    return { labels: buckets.map(dayLabel), values, buckets };
  }

  const validOrders = (orders) => orders.filter((o) => o.status !== "Cancelled");
  const inRange = (orders, from, to = Date.now()) => orders.filter((o) => o.createdAt >= from && o.createdAt <= to);

  function delta(curr, prev) {
    if (!prev) return curr ? { text: "New", cls: "up" } : { text: "—", cls: "" };
    const pct = ((curr - prev) / prev) * 100;
    return { text: `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}% vs previous period`, cls: pct >= 0 ? "up" : "down" };
  }

  function downloadCSV(filename, rows) {
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return { DAY, draw, baseOptions, dayBuckets, dayLabel, dailySeries, validOrders, inRange, delta, startOfDay, downloadCSV };
})();
