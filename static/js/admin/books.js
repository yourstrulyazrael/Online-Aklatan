document.addEventListener("DOMContentLoaded", async () => {
  const { $, $$, esc, money, cover } = UI;
  const params = new URLSearchParams(location.search);
  const state = { q: "", genre: "", stock: params.get("stock") || "all", sort: "title", dir: 1 };
  let books = [];
  let restockId = null;
  let editing = null;      // the book open in the form (null when adding)
  let uploading = false;
  let formUploads = [];    // images uploaded while the form is open; unused ones are deleted on close

  const byId = (id) => books.find((b) => b.id === Number(id));

  async function load() {
    try { books = await Store.adminBooks(); fillGenres(); render(); }
    catch (err) { UI.handleError(err); }
  }

  function render() {
    const q = state.q.trim().toLowerCase();
    const list = books.filter((b) =>
      (!q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.isbn.includes(q)) &&
      (!state.genre || b.genre === state.genre) &&
      (state.stock === "all" || (state.stock === "out" ? b.stock <= 0 : b.stock <= Store.LOW_STOCK)));
    list.sort((a, b) => {
      const x = a[state.sort], y = b[state.sort];
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * state.dir;
    });

    const units = books.reduce((s, b) => s + b.stock, 0);
    const value = books.reduce((s, b) => s + b.stock * b.price, 0);
    $("#inv-summary").textContent = `${books.length} titles · ${units.toLocaleString()} copies on hand · ${money(value)} inventory value`;

    $$("th[data-sort]").forEach((th) => {
      th.classList.toggle("sorted-asc", th.dataset.sort === state.sort && state.dir === 1);
      th.classList.toggle("sorted-desc", th.dataset.sort === state.sort && state.dir === -1);
    });

    $("#inv-body").innerHTML = list.length ? list.map((b) => {
      const cls = b.stock <= 0 ? "out" : b.stock <= Store.LOW_STOCK ? "low" : "";
      return `<tr data-row-id="${b.id}">
        <td><div class="book-cell"><div class="cover-cell">${cover(b, "cover-xs")}</div><div><strong>${esc(b.title)}</strong><span class="muted small">${esc(b.author)}${b.isbn ? " · ISBN " + esc(b.isbn) : ""}</span></div></div></td>
        <td>${esc(b.genre)}</td>
        <td class="right num">${money(b.price)}</td>
        <td><span class="num"><strong>${b.stock}</strong></span> ${cls ? UI.stockBadge(b.stock) : ""}
          <div class="stock-bar ${cls}"><span style="width:${Math.min(100, (b.stock / 40) * 100)}%"></span></div></td>
        <td class="right num">${b.sold}</td>
        <td class="right num">${money(b.revenue)}</td>
        <td><div class="row-actions">
          <button class="btn btn-ghost btn-sm" data-restock="${b.id}">Restock</button>
          <a class="icon-btn" href="/admin/analytics?id=${b.id}" title="Analytics" aria-label="Analytics for ${esc(b.title)}">📈</a>
          <button class="icon-btn" data-edit="${b.id}" title="Edit" aria-label="Edit ${esc(b.title)}">✎</button>
          <button class="icon-btn" data-delete="${b.id}" title="Remove" aria-label="Remove ${esc(b.title)}" style="color:var(--critical)">🗑</button>
        </div></td>
      </tr>`;
    }).join("") : `<tr><td colspan="7" class="empty">No books match these filters.</td></tr>`;
  }

  function fillGenres() {
    const genres = [...new Set(books.map((b) => b.genre))].sort();
    $("#inv-genre").innerHTML = `<option value="">All genres</option>` + genres.map((g) => `<option ${g === state.genre ? "selected" : ""}>${esc(g)}</option>`).join("");
    $("#genre-options").innerHTML = genres.map((g) => `<option value="${esc(g)}">`).join("");
  }

  // ---------- Add / edit ----------
  function openBookForm(book) {
    const f = $("#book-form");
    f.reset();
    $("#book-form-error").textContent = "";
    $("#book-modal-title").textContent = book ? "Edit book" : "Add book";
    // Stock on existing books only changes through Restock, so it's tracked in the history.
    $("#stock-field").hidden = !!book;
    if (book) ["id", "title", "author", "genre", "price", "year", "isbn", "pages", "coverUrl", "description"].forEach((k) => (f.elements[k].value = book[k] ?? ""));
    else f.elements.id.value = "";
    editing = book;
    formUploads = [];
    setProgress(null);
    renderCoverPreview();
    UI.openModal("book-modal");
  }

  // ---------- Cover editor (drag & drop / browse / paste / URL) ----------
  const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  const MAX_BYTES = 5 * 1024 * 1024;
  const form = $("#book-form");
  const drop = $("#cover-drop");

  function renderCoverPreview() {
    const f = form.elements;
    $("#cover-preview").innerHTML = cover({
      title: f.title.value.trim() || "Untitled",
      author: f.author.value.trim() || "Author",
      cover: editing ? editing.cover : ["#2b1e16", "#ae1818"],
      coverUrl: f.coverUrl.value.trim(),
    });
    $("#cover-clear").hidden = !f.coverUrl.value.trim();
  }
  ["title", "author", "coverUrl"].forEach((k) => form.elements[k].addEventListener("input", renderCoverPreview));

  function setProgress(fraction) {
    const bar = $("#cover-progress");
    bar.hidden = fraction === null;
    if (fraction !== null) bar.firstElementChild.style.width = Math.round(fraction * 100) + "%";
  }

  function checkFile(file) {
    if (!file) return "No file found.";
    if (!ACCEPTED.includes(file.type)) return "Use a JPG, PNG, WebP or GIF image.";
    if (file.size > MAX_BYTES) return "Images must be 5 MB or smaller.";
    return "";
  }

  async function uploadToForm(file) {
    const problem = checkFile(file);
    if (problem) { UI.toast(problem, "critical"); return; }
    uploading = true;
    form.querySelector("[type=submit]").disabled = true;
    setProgress(0);
    try {
      const { url } = await Store.uploadCover(file, setProgress);
      formUploads.push(url);
      form.elements.coverUrl.value = url;
      renderCoverPreview();
      UI.toast("Cover uploaded", "good");
    } catch (err) { UI.handleError(err); }
    finally {
      uploading = false;
      setProgress(null);
      form.querySelector("[type=submit]").disabled = false;
    }
  }

  // An image dragged from another web page arrives as a URL rather than a file.
  function droppedUrl(dt) {
    const uri = (dt.getData("text/uri-list") || dt.getData("text/plain") || "").split("\n")[0].trim();
    return /^https?:\/\//i.test(uri) ? uri : "";
  }

  drop.addEventListener("click", () => $("#cover-file").click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#cover-file").click(); } });
  $("#cover-file").addEventListener("change", (e) => { uploadToForm(e.target.files[0]); e.target.value = ""; });
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("dragover"); }));
  ["dragleave", "dragend"].forEach((t) => drop.addEventListener(t, (e) => {
    if (!drop.contains(e.relatedTarget)) drop.classList.remove("dragover");
  }));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("dragover");
    if (uploading) return;
    const file = e.dataTransfer.files[0];
    if (file) { uploadToForm(file); return; }
    const url = droppedUrl(e.dataTransfer);
    if (url) { form.elements.coverUrl.value = url; renderCoverPreview(); }
  });
  $("#cover-clear").addEventListener("click", () => { form.elements.coverUrl.value = ""; renderCoverPreview(); });

  // When the form closes (saved or cancelled), delete uploads that didn't end up as the book's cover.
  // The server keeps any file a book still points at, so this is safe after a save too.
  $("#book-modal").addEventListener("modalclose", () => {
    formUploads.forEach((url) => Store.discardUpload(url));
    formUploads = [];
  });
  document.addEventListener("paste", (e) => {
    if ($("#book-modal").hidden || uploading) return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === "file" && i.type.startsWith("image/"));
    if (item) { e.preventDefault(); uploadToForm(item.getAsFile()); }
  });

  // ---------- Drop an image straight onto a table row ----------
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  let dropRow = null;
  function markRow(row) {
    if (dropRow && dropRow !== row) dropRow.classList.remove("drop-target");
    dropRow = row;
    if (row) row.classList.add("drop-target");
  }
  $("#inv-body").addEventListener("dragover", (e) => {
    const row = e.target.closest("tr[data-row-id]");
    if (!row || !hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    markRow(row);
  });
  $("#inv-body").addEventListener("dragleave", (e) => {
    if (dropRow && !dropRow.contains(e.relatedTarget)) markRow(null);
  });
  $("#inv-body").addEventListener("drop", async (e) => {
    const row = e.target.closest("tr[data-row-id]");
    markRow(null);
    if (!row || !hasFiles(e)) return;
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    const problem = checkFile(file);
    if (problem) { UI.toast(problem, "critical"); return; }
    const book = byId(row.dataset.rowId);
    row.classList.add("uploading");
    try {
      const { url } = await Store.uploadCover(file);
      await Store.setCover(book.id, url);
      UI.toast(`New cover for "${book.title}"`, "good");
      await load();
    } catch (err) { UI.handleError(err); row.classList.remove("uploading"); }
  });

  // A file dropped anywhere else would make the browser navigate away to it.
  ["dragover", "drop"].forEach((t) => document.addEventListener(t, (e) => { if (hasFiles(e)) e.preventDefault(); }));

  $("#book-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const err = $("#book-form-error");
    const data = {
      id: f.id.value ? Number(f.id.value) : null,
      title: f.title.value.trim(), author: f.author.value.trim(), genre: f.genre.value.trim(),
      price: Number(f.price.value), stock: Number(f.stock.value),
      year: f.year.value ? Number(f.year.value) : "", pages: f.pages.value ? Number(f.pages.value) : "",
      isbn: f.isbn.value.replace(/[^\dX]/gi, ""), coverUrl: f.coverUrl.value.trim(), description: f.description.value.trim(),
    };
    if (!data.title || !data.author || !data.genre) { err.textContent = "Title, author and genre are required."; return; }
    if (!(data.price > 0)) { err.textContent = "Price must be greater than zero."; return; }
    if (!data.id && (!Number.isInteger(data.stock) || data.stock < 0)) { err.textContent = "Initial stock must be a whole number (0 or more)."; return; }
    if (data.isbn && ![10, 13].includes(data.isbn.length)) { err.textContent = "ISBN must be 10 or 13 digits."; return; }
    if (uploading) { err.textContent = "Wait for the cover to finish uploading."; return; }
    const btn = e.target.querySelector("[type=submit]");
    btn.disabled = true;
    try {
      await Store.saveBook(data);
      UI.closeModal("book-modal");
      UI.toast(data.id ? "Book updated" : `"${data.title}" added to the catalog`, "good");
      await load();
    } catch (ex) { err.textContent = ex.message; }
    finally { btn.disabled = false; }
  });

  // ---------- Restock ----------
  function openRestock(id) {
    const b = byId(id);
    if (!b) return;
    restockId = b.id;
    $("#restock-book").innerHTML = `<strong>${esc(b.title)}</strong><br><span class="muted small">Current stock: ${b.stock}</span>`;
    $("#r-qty").value = 10;
    $("#r-note").value = "";
    $("#restock-error").textContent = "";
    updatePreview();
    UI.openModal("restock-modal");
  }
  function updatePreview() {
    const b = byId(restockId);
    const q = Number($("#r-qty").value) || 0;
    $("#restock-preview").textContent = b ? `New stock level will be ${b.stock + q}.` : "";
  }
  $("#r-qty").addEventListener("input", updatePreview);
  $$("[data-qty]").forEach((btn) => btn.addEventListener("click", () => { $("#r-qty").value = btn.dataset.qty; updatePreview(); }));
  $("#restock-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await Store.restock(restockId, $("#r-qty").value, $("#r-note").value.trim());
      UI.closeModal("restock-modal");
      UI.toast(`Added ${$("#r-qty").value} copies`, "good");
      await load();
    } catch (ex) { $("#restock-error").textContent = ex.message; }
  });

  // ---------- Table actions ----------
  $("#inv-body").addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.restock) openRestock(t.dataset.restock);
    if (t.dataset.edit) openBookForm(byId(t.dataset.edit));
    if (t.dataset.delete) {
      const b = byId(t.dataset.delete);
      if (await UI.confirmDialog(`Remove "${b.title}" from the catalog? Past orders keep their records.`, "Remove book")) {
        try { await Store.deleteBook(b.id); UI.toast("Book removed"); await load(); }
        catch (err) { UI.handleError(err); }
      }
    }
  });
  $$("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
    if (state.sort === th.dataset.sort) state.dir *= -1;
    else { state.sort = th.dataset.sort; state.dir = ["title", "genre"].includes(th.dataset.sort) ? 1 : -1; }
    render();
  }));

  $("#inv-q").addEventListener("input", (e) => { state.q = e.target.value; render(); });
  $("#inv-genre").addEventListener("change", (e) => { state.genre = e.target.value; render(); });
  $("#inv-stock").addEventListener("click", (e) => {
    const b = e.target.closest("[data-stock]");
    if (!b) return;
    state.stock = b.dataset.stock;
    $$("#inv-stock button").forEach((x) => x.classList.toggle("active", x === b));
    render();
  });
  $$("#inv-stock button").forEach((x) => x.classList.toggle("active", x.dataset.stock === state.stock));

  $("#add-btn").addEventListener("click", () => openBookForm(null));
  $("#export-btn").addEventListener("click", () => {
    Charts.downloadCSV("inventory.csv", [
      ["ID", "Title", "Author", "Genre", "ISBN", "Price", "Stock", "Units sold", "Revenue"],
      ...books.map((b) => [b.id, b.title, b.author, b.genre, b.isbn, b.price, b.stock, b.sold, b.revenue]),
    ]);
  });

  $("#inv-body").innerHTML = `<tr><td colspan="7"><div class="loading"><div class="spinner"></div></div></td></tr>`;
  await load();
  if (params.get("restock")) openRestock(params.get("restock"));
});
