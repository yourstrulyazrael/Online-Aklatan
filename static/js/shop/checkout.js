document.addEventListener("DOMContentLoaded", async () => {
  const { $, $$, esc, money, cover } = UI;
  const form = $("#checkout-form");
  let promo = "";
  try { promo = sessionStorage.getItem("bookstore.promo") || ""; } catch (_) {}
  let wallet = "GCash";
  let pendingOtp = null;
  let q;

  try { q = await Store.cart(promo); }
  catch (err) { UI.handleError(err); return; }
  if (q.promo?.error) { promo = ""; q = await Store.cart(); }
  if (!q.lines.length) {
    form.outerHTML = `<div class="card empty"><div class="empty-icon">🛒</div><h2>Nothing to check out</h2><a class="btn btn-primary" href="/">Browse books</a></div>`;
    return;
  }

  // Prefill from the signed-in account (checkout is only reachable when signed in).
  const user = Store.currentUser();
  $("#c-name").value = user.name;
  $("#c-email").value = user.email;

  function renderSummary() {
    const method = form.elements.method.value;
    const label = { cash: "Place order", ewallet: `Pay ${money(q.total)} with ${wallet}`, card: `Pay ${money(q.total)}` }[method];
    $("#summary").innerHTML = `
      <h2>Order summary</h2>
      ${q.lines.map((l) => `
        <div class="cart-line" style="grid-template-columns:48px 1fr auto;padding:10px 0">
          ${cover(l.book, "cover-xs")}
          <div><strong class="small">${esc(l.book.title)}</strong><div class="muted small">Qty ${l.qty}</div></div>
          <span class="num small">${money(l.book.price * l.qty)}</span>
        </div>`).join("")}
      <hr style="margin:10px 0">
      <div class="summary-row"><span>Subtotal</span><span class="num">${money(q.subtotal)}</span></div>
      ${q.discount ? `<div class="summary-row discount"><span>Discount (${esc(q.promo.code)})</span><span class="num">−${money(q.discount)}</span></div>` : ""}
      <div class="summary-row"><span>Shipping</span><span class="num">${q.shipping ? money(q.shipping) : "Free"}</span></div>
      <div class="summary-row total"><span>Total</span><span class="num">${money(q.total)}</span></div>
      <button class="btn btn-primary btn-block" type="submit" style="margin-top:14px">${label}</button>
      <p class="small muted" style="text-align:center;margin:10px 0 0"><a href="/cart">Edit cart</a></p>`;
  }

  // ---------- Payment method switching ----------
  form.addEventListener("change", (e) => {
    if (e.target.name !== "method") return;
    $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== e.target.value));
    renderSummary();
  });
  $$("[data-wallet]").forEach((b) => b.addEventListener("click", () => {
    wallet = b.dataset.wallet;
    $$("[data-wallet]").forEach((x) => x.classList.toggle("active", x === b));
    $("#ew-name").textContent = wallet;
    renderSummary();
  }));

  // ---------- Card helpers ----------
  const digits = (s) => s.replace(/\D/g, "");
  function cardBrand(num) {
    if (/^4/.test(num)) return "Visa";
    if (/^(5[1-5]|2[2-7])/.test(num)) return "Mastercard";
    if (/^3[47]/.test(num)) return "Amex";
    if (/^35/.test(num)) return "JCB";
    return "";
  }
  function luhn(num) {
    let sum = 0;
    for (let i = 0; i < num.length; i++) {
      let d = Number(num[num.length - 1 - i]);
      if (i % 2) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    return num.length >= 13 && sum % 10 === 0;
  }
  $("#card-number").addEventListener("input", (e) => {
    const d = digits(e.target.value).slice(0, 19);
    e.target.value = d.replace(/(.{4})/g, "$1 ").trim();
    const brand = cardBrand(d);
    $("#card-brand").textContent = brand;
    $("#cp-brand").textContent = brand;
    $("#cp-number").textContent = (d + "•".repeat(Math.max(0, 16 - d.length))).replace(/(.{4})/g, "$1 ").trim();
  });
  $("#card-name").addEventListener("input", (e) => ($("#cp-name").textContent = e.target.value.toUpperCase() || "CARDHOLDER NAME"));
  $("#card-exp").addEventListener("input", (e) => {
    let d = digits(e.target.value).slice(0, 4);
    if (d.length >= 3) d = d.slice(0, 2) + "/" + d.slice(2);
    e.target.value = d;
    $("#cp-exp").textContent = d || "MM/YY";
  });
  $("#card-cvv").addEventListener("input", (e) => (e.target.value = digits(e.target.value)));
  $("#ew-number").addEventListener("input", (e) => (e.target.value = digits(e.target.value)));
  $("#c-phone").addEventListener("input", (e) => (e.target.value = digits(e.target.value).slice(0, 11)));

  // ---------- Validation ----------
  function setError(input, msg) {
    const err = input.closest(".field").querySelector(".field-error");
    if (err) err.textContent = msg || "";
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    return !msg;
  }
  const mobileOk = (v) => /^09\d{9}$/.test(v);
  // Clear a field's error as soon as the user edits it; it is re-checked on submit.
  form.addEventListener("input", (e) => {
    if (e.target.getAttribute("aria-invalid") === "true") setError(e.target, "");
  });

  function validate() {
    let ok = true;
    const check = (sel, msg) => { ok = setError($(sel), msg) && ok; };
    check("#c-name", form.elements.name.value.trim().length < 2 ? "Please enter your full name." : "");
    check("#c-email", /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.elements.email.value.trim()) ? "" : "Enter a valid email address.");
    check("#c-phone", mobileOk(form.elements.phone.value) ? "" : "Use an 11-digit mobile number starting with 09.");
    check("#c-city", form.elements.city.value.trim() ? "" : "City is required.");
    check("#c-address", form.elements.address.value.trim().length < 5 ? "Please enter your street address." : "");

    const method = form.elements.method.value;
    if (method === "cash") {
      const ch = $("#cash-change").value;
      check("#cash-change", ch && Number(ch) < q.total ? `Must be at least ${money(q.total)}.` : "");
    }
    if (method === "ewallet") {
      check("#ew-number", mobileOk($("#ew-number").value) ? "" : `Enter your 11-digit ${wallet} number.`);
    }
    if (method === "card") {
      const num = digits($("#card-number").value);
      check("#card-number", !luhn(num) ? "That card number isn't valid." : !["Visa", "Mastercard"].includes(cardBrand(num)) ? "We accept Visa and Mastercard only." : "");
      check("#card-name", $("#card-name").value.trim().length < 2 ? "Enter the name on the card." : "");
      const m = /^(\d{2})\/(\d{2})$/.exec($("#card-exp").value);
      let expMsg = "Use the MM/YY format.";
      if (m && +m[1] >= 1 && +m[1] <= 12) {
        const now = new Date();
        const exp = new Date(2000 + +m[2], +m[1], 1); // first day of the month after expiry
        expMsg = exp <= now ? "This card has expired." : "";
      }
      check("#card-exp", expMsg);
      check("#card-cvv", /^\d{3,4}$/.test($("#card-cvv").value) ? "" : "Enter the 3 or 4 digit code.");
    }
    if (!ok) {
      const first = $('[aria-invalid="true"]', form);
      if (first) first.focus();
    }
    return ok;
  }

  // ---------- Submit ----------
  function processing(msg) {
    const el = document.createElement("div");
    el.className = "processing";
    el.innerHTML = `<div class="processing-box"><div class="spinner"></div><strong>${esc(msg)}</strong><p class="small muted" style="margin:.3em 0 0">Please don't close this page.</p></div>`;
    document.body.append(el);
    return el;
  }

  async function finish(payment) {
    const overlay = processing(payment.method === "cash" ? "Placing your order…" : "Processing payment…");
    // A short pause so the payment step reads as a step; the real work is the API call.
    await new Promise((r) => setTimeout(r, 900));
    try {
      const order = await Store.placeOrder({
        customer: {
          name: form.elements.name.value.trim(), email: form.elements.email.value.trim(), phone: form.elements.phone.value,
          address: form.elements.address.value.trim(), city: form.elements.city.value.trim(), notes: form.elements.notes.value.trim(),
        },
        payment, promoCode: promo,
      });
      try { sessionStorage.removeItem("bookstore.promo"); } catch (_) {}
      location.href = "/order/" + order.id;
    } catch (err) {
      overlay.remove();
      UI.handleError(err);
      try { q = await Store.cart(promo); renderSummary(); } catch (_) {}
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validate()) return;
    const method = form.elements.method.value;
    if (method === "cash") {
      finish({ method, provider: "Cash on Delivery", changeFor: Number($("#cash-change").value) || 0 });
    } else if (method === "card") {
      const num = digits($("#card-number").value);
      finish({ method, provider: cardBrand(num), last4: num.slice(-4) });
    } else {
      pendingOtp = String(Math.floor(100000 + Math.random() * 900000));
      const n = $("#ew-number").value;
      $("#otp-number").textContent = n.slice(0, 4) + "•••" + n.slice(-4);
      $("#otp-wallet").textContent = wallet;
      $("#otp-demo").textContent = pendingOtp;
      $("#otp").value = "";
      setError($("#otp"), "");
      UI.openModal("otp-modal");
    }
  });

  $("#otp-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if ($("#otp").value !== pendingOtp) { setError($("#otp"), "Incorrect code. Please try again."); return; }
    UI.closeModal("otp-modal");
    const n = $("#ew-number").value;
    finish({ method: "ewallet", provider: wallet, account: n });
  });

  renderSummary();
});
