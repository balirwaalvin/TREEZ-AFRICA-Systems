/* ============================================
   TREEZ AFRICA SYSTEMS — Admin: Receipts
   Issue a receipt for a payment, preview the PDF, and email it to the client.
   Each receipt is one payment against an invoice (see migrations/0002_receipts.sql).
   ============================================ */

(() => {
  const api = window.TREEZ_API.admin;
  const pdf = window.TreezReceipt;
  const PREVIEW_DELAY = 350;
  const SENDER = 'receipts@treez.tech';
  const CHANNELS = ['ABSA Bank (U) Limited', 'Stanbic Bank Uganda', 'Centenary Bank', 'DFCU Bank', 'MTN Mobile Money', 'Airtel Money', 'Cash'];

  const $ = (id) => document.getElementById(id);
  const els = {
    notice: $('receiptNotice'),
    index: $('receiptIndex'),
    list: $('receiptList'),
    totals: $('receiptTotals'),
    search: $('receiptSearch'),
    workspace: $('receiptWorkspace'),
    form: $('receiptForm'),
    items: $('receiptItems'),
    summary: $('receiptSummary'),
    formMessage: $('receiptFormMessage'),
    detail: $('receiptDetail'),
    preview: $('receiptPreview'),
    previewStatus: $('receiptPreviewStatus'),
    previewFallback: $('receiptPreviewFallback'),
    channels: $('paymentChannels'),
    dialog: $('receiptDialog')
  };

  const state = {
    invoices: [],
    receipts: [],
    loaded: false,
    loading: null,
    query: '',
    mode: 'index', // index | new | view
    viewingId: null,
    previewUrl: null,
    previewTimer: null,
    previewRun: 0,
    busy: false
  };

  // ---- Money and dates ----

  /** "1,200,000" or "1200000.5" → 120000050 cents; NaN when it isn't a number. */
  function parseMoney(value) {
    const cleaned = String(value ?? '').replace(/[\s,]/g, '');
    if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return NaN;
    return Math.round(Number(cleaned) * 100);
  }

  /** 120000050 → "1,200,000.50" for an input box; whole amounts drop the decimals. */
  function moneyInput(cents) {
    const whole = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return cents % 100 ? `${whole}.${String(cents % 100).padStart(2, '0')}` : whole;
  }

  function parseQuantity(value) {
    const cleaned = String(value ?? '').replace(/[\s,]/g, '');
    if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return NaN;
    return Number(cleaned);
  }

  function today() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  const byPaymentOrder = (a, b) => (a.paidOn === b.paidOn ? String(a.createdAt).localeCompare(String(b.createdAt)) : a.paidOn.localeCompare(b.paidOn));
  const invoiceById = (id) => state.invoices.find((invoice) => invoice.id === id);
  const receiptsOf = (invoiceId) => state.receipts.filter((receipt) => receipt.invoiceId === invoiceId).sort(byPaymentOrder);
  const paidSoFar = (invoiceId) => receiptsOf(invoiceId).reduce((sum, receipt) => sum + receipt.amount, 0);
  const balanceOf = (invoice) => pdf.total(invoice.items) - paidSoFar(invoice.id);

  /** Payments on the receipt's invoice up to and including it, as printed on that receipt. */
  function historyFor(receipt) {
    return receiptsOf(receipt.invoiceId).filter((other) => byPaymentOrder(other, receipt) <= 0);
  }

  // ---- Suggested numbers, in the house formats ----

  /** TAH-YYYYMMDD-NNN, numbering invoices created on the same day. */
  function suggestInvoiceNumber() {
    const prefix = `TAH-${today().replace(/-/g, '')}-`;
    const used = state.invoices.map((invoice) => invoice.number).filter((number) => number.startsWith(prefix)).map((number) => Number(number.slice(prefix.length)) || 0);
    return `${prefix}${String(Math.max(0, ...used) + 1).padStart(3, '0')}`;
  }

  /** TAH 8989 NNNN with a random, unused last group, like the existing receipts. */
  function suggestReceiptNumber() {
    const used = new Set(state.receipts.map((receipt) => receipt.number));
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const number = `TAH 8989 ${String(Math.floor(Math.random() * 9000) + 1000)}`;
      if (!used.has(number)) return number;
    }
    return `TAH 8989 ${String(Date.now()).slice(-4)}`;
  }

  // ---- Loading ----

  function load(force = false) {
    if (state.loading) return state.loading;
    if (state.loaded && !force) return Promise.resolve();
    state.loading = api.receipts()
      .then((data) => {
        state.invoices = data.invoices;
        state.receipts = data.receipts;
        state.loaded = true;
        renderIndex();
        if (state.mode === 'view') openReceipt(state.viewingId, { replaceHash: false });
      })
      .catch(handleError)
      .finally(() => { state.loading = null; });
    // Fetch the PDF tools in the background so the first preview is quick.
    pdf.load().catch(() => {});
    return state.loading;
  }

  function handleError(error) {
    // A session can expire while the dashboard is open; reloading shows the sign-in form.
    if (error.status === 401) { window.location.reload(); return; }
    showMessage(els.notice, error.message || 'Something went wrong.', true);
  }

  // ---- Index ----

  function renderIndex() {
    const outstanding = state.invoices.reduce((sum, invoice) => {
      const balance = balanceOf(invoice);
      return balance > 0 ? { ...sum, [invoice.currency]: (sum[invoice.currency] || 0) + balance } : sum;
    }, {});
    const unsent = state.receipts.filter((receipt) => !receipt.sentAt).length;
    const owed = Object.entries(outstanding).map(([currency, cents]) => pdf.money(cents, currency)).join(' + ');
    els.totals.innerHTML = [
      `<strong>${state.receipts.length}</strong> receipt${state.receipts.length === 1 ? '' : 's'}`,
      owed ? `Outstanding: <strong>${escapeHtml(owed)}</strong>` : 'Nothing outstanding',
      unsent ? `<strong>${unsent}</strong> not sent yet` : ''
    ].filter(Boolean).join(' · ');

    const query = state.query;
    const rows = state.receipts.filter((receipt) => {
      if (!query) return true;
      const invoice = invoiceById(receipt.invoiceId) || {};
      return [receipt.number, receipt.channel, invoice.number, invoice.clientName, invoice.clientEmail].some((value) => String(value || '').toLowerCase().includes(query));
    });

    els.list.innerHTML = rows.length
      ? rows.map((receipt) => {
        const invoice = invoiceById(receipt.invoiceId) || { currency: '', clientName: 'Unknown client', number: '' };
        return `<button class="admin-receipt-row" data-open-receipt="${receipt.id}" type="button">
          <span class="admin-receipt-row-number">${escapeHtml(receipt.number)}</span>
          <span class="admin-receipt-row-client"><strong>${escapeHtml(invoice.clientName)}</strong><span>Invoice ${escapeHtml(invoice.number)} · ${escapeHtml(receipt.channel)}</span></span>
          <span class="admin-receipt-row-date">${escapeHtml(pdf.longDate(receipt.paidOn))}</span>
          <span class="admin-receipt-row-amount">${escapeHtml(pdf.money(receipt.amount, invoice.currency))}</span>
          ${statusPill(receipt)}
        </button>`;
      }).join('')
      : `<p class="admin-empty">${state.receipts.length ? 'No receipts match your search.' : 'No receipts yet. Use “New receipt” to issue the first one.'}</p>`;
    refreshIcons();
  }

  const statusPill = (receipt) => (receipt.sentAt
    ? '<span class="admin-status admin-status-sent">Sent</span>'
    : '<span class="admin-status admin-status-unsent">Not sent</span>');

  function showIndex({ replaceHash = true } = {}) {
    state.mode = 'index';
    state.viewingId = null;
    els.workspace.hidden = true;
    els.index.hidden = false;
    clearPreview();
    if (replaceHash) history.replaceState(null, '', '#receipts');
    renderIndex();
  }

  function showWorkspace(mode) {
    state.mode = mode;
    els.index.hidden = true;
    els.workspace.hidden = false;
    els.form.hidden = mode !== 'new';
    els.detail.hidden = mode !== 'view';
    showMessage(els.notice, '');
  }

  // ---- New receipt form ----

  function openNew(invoiceId = '') {
    showWorkspace('new');
    state.viewingId = null;
    history.replaceState(null, '', '#receipts/new');
    els.form.reset();
    showMessage(els.formMessage, '');

    const open = state.invoices.filter((invoice) => balanceOf(invoice) > 0);
    els.form.elements.invoiceId.innerHTML = ['<option value="">New invoice</option>', ...open.map((invoice) => `<option value="${invoice.id}">${escapeHtml(invoice.number)} · ${escapeHtml(invoice.clientName)} · balance ${escapeHtml(pdf.money(balanceOf(invoice), invoice.currency))}</option>`)].join('');
    const channels = [...new Set([...state.receipts.map((receipt) => receipt.channel), ...CHANNELS])];
    els.channels.innerHTML = channels.map((channel) => `<option value="${escapeHtml(channel)}"></option>`).join('');

    els.form.elements.invoiceId.value = open.some((invoice) => invoice.id === invoiceId) ? invoiceId : '';
    els.form.elements.paidOn.value = today();
    els.form.elements.paidOn.max = today();
    els.form.elements.receiptNumber.value = suggestReceiptNumber();
    fillInvoice(invoiceById(els.form.elements.invoiceId.value));
    (els.form.elements.invoiceId.value ? els.form.elements.amount : els.form.elements.clientName).focus({ preventScroll: true });
    window.scrollTo({ top: els.workspace.offsetTop - 16, behavior: 'smooth' });
  }

  /** Fills the invoice and client fields from a saved invoice, or blanks them for a new one. */
  function fillInvoice(invoice) {
    const { elements } = els.form;
    elements.invoiceNumber.value = invoice ? invoice.number : suggestInvoiceNumber();
    elements.currency.value = invoice ? invoice.currency : 'UGX';
    elements.clientName.value = invoice ? invoice.clientName : '';
    elements.clientAddress.value = invoice ? invoice.clientAddress : '';
    elements.clientEmail.value = invoice ? invoice.clientEmail : '';
    elements.clientPhone.value = invoice ? invoice.clientPhone : '';
    renderItems(invoice ? invoice.items : [{ description: '', quantity: 1, unitPrice: NaN }]);
    // A follow-up payment usually settles the rest, the same way the last one was paid.
    elements.amount.value = invoice ? moneyInput(balanceOf(invoice)) : '';
    elements.channel.value = invoice ? receiptsOf(invoice.id).at(-1)?.channel || '' : '';
    updateSummary();
    schedulePreview();
  }

  function renderItems(items) {
    els.items.innerHTML = items.map((item) => `<div class="admin-receipt-item">
        <label class="admin-receipt-item-description">Description<textarea data-item="description" rows="2" placeholder="e.g. Development:&#10;CDSU Full Stack App Platform">${escapeHtml(item.description)}</textarea></label>
        <label>Qty<input data-item="quantity" inputmode="decimal" autocomplete="off" value="${Number.isFinite(item.quantity) ? item.quantity : ''}"></label>
        <label>Unit price<input data-item="unitPrice" inputmode="decimal" autocomplete="off" placeholder="2,200,000" value="${Number.isFinite(item.unitPrice) ? moneyInput(item.unitPrice) : ''}"></label>
        <span class="admin-receipt-item-amount" data-item-amount></span>
        <button class="admin-button admin-button-quiet admin-button-icon" data-receipt-action="remove-item" type="button" aria-label="Remove item" title="Remove item"><i data-lucide="x"></i></button>
      </div>`).join('');
    updateItemControls();
    refreshIcons();
  }

  function updateItemControls() {
    const rows = els.items.querySelectorAll('.admin-receipt-item');
    rows.forEach((row) => { row.querySelector('[data-receipt-action="remove-item"]').hidden = rows.length === 1; });
  }

  /** Reads the form. Returns the data plus the first problem found, if any. */
  function readForm() {
    const { elements } = els.form;
    const currency = elements.currency.value;
    const items = [...els.items.querySelectorAll('.admin-receipt-item')].map((row) => ({
      description: row.querySelector('[data-item="description"]').value.trim(),
      quantity: parseQuantity(row.querySelector('[data-item="quantity"]').value),
      unitPrice: parseMoney(row.querySelector('[data-item="unitPrice"]').value)
    }));
    const invoiceId = elements.invoiceId.value;
    const invoice = {
      id: invoiceId || undefined,
      number: elements.invoiceNumber.value.trim(),
      currency,
      clientName: elements.clientName.value.trim(),
      clientAddress: elements.clientAddress.value.split('\n').map((line) => line.trim()).filter(Boolean).join('\n'),
      clientEmail: elements.clientEmail.value.trim(),
      clientPhone: elements.clientPhone.value.trim(),
      items
    };
    const receipt = {
      number: elements.receiptNumber.value.trim(),
      paidOn: elements.paidOn.value,
      amount: parseMoney(elements.amount.value),
      channel: elements.channel.value.trim()
    };

    const validItems = items.every((item) => item.description && item.quantity > 0 && Number.isFinite(item.unitPrice));
    const total = validItems ? pdf.total(items) : NaN;
    const paidBefore = invoiceId ? paidSoFar(invoiceId) : 0;
    const balance = total - paidBefore;
    let problem = '';
    if (!invoice.number) problem = 'Enter an invoice number.';
    else if (!invoice.clientName) problem = 'Enter the client’s name.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoice.clientEmail)) problem = 'Enter the client’s email address. The receipt is sent there.';
    else if (!items.every((item) => item.description)) problem = 'Every item needs a description.';
    else if (!items.every((item) => item.quantity > 0)) problem = 'Every item needs a quantity above zero.';
    else if (!items.every((item) => Number.isFinite(item.unitPrice))) problem = 'Every item needs a unit price, like 2,200,000.';
    else if (!(total > 0)) problem = 'The invoice total must be more than zero.';
    else if (!(receipt.amount > 0)) problem = 'Enter the amount paid, like 1,200,000.';
    else if (receipt.amount > balance) problem = balance > 0 ? `The amount paid is more than the balance of ${pdf.money(balance, currency)}.` : 'This invoice is already paid in full.';
    else if (!receipt.paidOn) problem = 'Enter the date paid.';
    else if (!receipt.channel) problem = 'Enter the payment channel, e.g. the bank.';
    else if (!receipt.number) problem = 'Enter a receipt number.';
    else if (state.receipts.some((other) => other.number === receipt.number)) problem = `Receipt number ${receipt.number} is already used.`;
    else if (!invoiceId && state.invoices.some((other) => other.number === invoice.number)) problem = `Invoice number ${invoice.number} is already used. Pick that invoice from the list instead, or change the number.`;
    return { invoice, receipt, total, paidBefore, balance, problem };
  }

  function updateSummary() {
    const { invoice, receipt, total, paidBefore } = readForm();
    els.items.querySelectorAll('.admin-receipt-item').forEach((row, index) => {
      const item = invoice.items[index];
      row.querySelector('[data-item-amount]').textContent = item.quantity > 0 && Number.isFinite(item.unitPrice) ? pdf.money(pdf.lineAmount(item), invoice.currency) : '—';
    });
    const amount = receipt.amount > 0 ? receipt.amount : 0;
    const after = total - paidBefore - amount;
    const known = Number.isFinite(total);
    const rows = [
      ['Invoice total', known ? pdf.money(total, invoice.currency) : '—'],
      paidBefore ? ['Paid before', pdf.money(paidBefore, invoice.currency)] : null,
      ['This payment', pdf.money(amount, invoice.currency), 'is-strong'],
      ['Balance after', known ? (after === 0 ? 'Paid in full' : pdf.money(after, invoice.currency)) : '—', known && after < 0 ? 'is-error' : '']
    ].filter(Boolean);
    els.summary.innerHTML = rows.map(([label, value, className = '']) => `<div class="${className}"><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  }

  /** What the preview shows for the unsaved receipt: earlier payments plus this one. */
  function draftPreviewData() {
    const { invoice, receipt } = readForm();
    const items = invoice.items.map((item) => ({
      description: item.description || 'Item description',
      quantity: item.quantity > 0 ? item.quantity : 1,
      unitPrice: Number.isFinite(item.unitPrice) ? item.unitPrice : 0
    }));
    const draft = {
      number: receipt.number || 'TAH 0000 0000',
      paidOn: receipt.paidOn || today(),
      amount: receipt.amount > 0 ? receipt.amount : 0,
      channel: receipt.channel || 'Payment channel'
    };
    const earlier = invoice.id ? receiptsOf(invoice.id) : [];
    return {
      invoice: { ...invoice, number: invoice.number || 'TAH-00000000-000', clientName: invoice.clientName || 'Client name', items },
      receipt: draft,
      history: [...earlier, draft]
    };
  }

  // ---- Preview ----

  function schedulePreview() {
    clearTimeout(state.previewTimer);
    els.previewStatus.textContent = 'Updating…';
    els.previewStatus.className = '';
    state.previewTimer = setTimeout(() => {
      if (state.mode === 'new') showPreview(draftPreviewData());
    }, PREVIEW_DELAY);
  }

  async function showPreview(data) {
    const run = ++state.previewRun;
    els.previewStatus.textContent = 'Updating…';
    els.previewStatus.className = '';
    try {
      const bytes = await pdf.render(data);
      if (run !== state.previewRun) return; // a newer edit has started its own render
      if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
      state.previewUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      // Chrome, Edge, Firefox and desktop Safari show PDFs inline; most phones don't.
      const inline = navigator.pdfViewerEnabled !== false;
      els.preview.hidden = !inline;
      els.previewFallback.hidden = inline;
      if (inline) els.preview.src = `${state.previewUrl}#toolbar=0&navpanes=0&view=FitH`;
      els.previewStatus.textContent = state.mode === 'new' ? 'Draft · updates as you type' : 'As sent to the client';
    } catch (error) {
      if (run !== state.previewRun) return;
      els.previewStatus.textContent = error.message || 'The preview could not be drawn.';
      els.previewStatus.className = 'is-error';
    }
  }

  function clearPreview() {
    clearTimeout(state.previewTimer);
    state.previewRun += 1;
    els.preview.removeAttribute('src');
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
    els.previewStatus.textContent = '';
  }

  // ---- Saving and sending ----

  async function save({ send }) {
    if (state.busy) return;
    const { invoice, receipt, problem } = readForm();
    if (problem) { showMessage(els.formMessage, problem, true); return; }
    showMessage(els.formMessage, '');

    if (send) {
      const ok = await confirmDialog({
        title: 'Send this receipt?',
        body: `<p>Receipt <strong>${escapeHtml(receipt.number)}</strong> for <strong>${escapeHtml(pdf.money(receipt.amount, invoice.currency))}</strong> will be emailed to <strong>${escapeHtml(invoice.clientEmail)}</strong> from ${SENDER}, with the PDF attached.</p><p>A copy goes to ${SENDER}. Once sent, a receipt can't be deleted.</p>`,
        confirm: 'Send receipt'
      });
      if (!ok) return;
    }

    setBusy(true, send ? 'Saving and sending…' : 'Saving…');
    let saved;
    try {
      saved = await api.createReceipt(invoice, receipt);
    } catch (error) {
      setBusy(false);
      if (error.status === 401) { handleError(error); return; }
      showMessage(els.formMessage, error.message || 'The receipt could not be saved.', true);
      return;
    }
    const index = state.invoices.findIndex((item) => item.id === saved.invoice.id);
    if (index === -1) state.invoices.unshift(saved.invoice); else state.invoices[index] = saved.invoice;
    state.receipts.unshift(saved.receipt);
    setBusy(false);

    openReceipt(saved.receipt.id);
    if (send) await sendReceipt(saved.receipt.id);
    else showMessage(els.notice, `Receipt ${saved.receipt.number} saved. It hasn't been emailed yet.`);
  }

  async function sendReceipt(id) {
    const receipt = state.receipts.find((item) => item.id === id);
    const invoice = receipt && invoiceById(receipt.invoiceId);
    if (!receipt || !invoice || state.busy) return;
    setBusy(true, `Sending to ${invoice.clientEmail}…`);
    try {
      const bytes = await pdf.render({ invoice, receipt, history: historyFor(receipt) });
      const updated = await api.sendReceipt(id, toBase64(bytes));
      Object.assign(receipt, updated);
      showMessage(els.notice, `Receipt ${receipt.number} sent to ${updated.sentTo}. A copy went to ${SENDER}.`);
    } catch (error) {
      if (error.status === 401) { handleError(error); return; }
      showMessage(els.notice, `Receipt ${receipt.number} is saved but was not sent. ${error.message || ''}`.trim(), true);
    } finally {
      setBusy(false);
      if (state.mode === 'view' && state.viewingId === id) renderDetail(receipt);
      renderIndex();
    }
  }

  function setBusy(busy, label = '') {
    state.busy = busy;
    els.workspace.querySelectorAll('button').forEach((button) => { if (button.dataset.receiptAction !== 'close') button.disabled = busy; });
    if (busy) showMessage(els.notice, label);
  }

  // ---- Saved receipt ----

  function openReceipt(id, { replaceHash = true } = {}) {
    const receipt = state.receipts.find((item) => item.id === id);
    if (!receipt) { if (state.loaded) showIndex(); return; }
    showWorkspace('view');
    state.viewingId = id;
    if (replaceHash) history.replaceState(null, '', `#receipts/${id}`);
    renderDetail(receipt);
    showPreview({ invoice: invoiceById(receipt.invoiceId), receipt, history: historyFor(receipt) });
  }

  function renderDetail(receipt) {
    const invoice = invoiceById(receipt.invoiceId);
    const balanceNow = balanceOf(invoice);
    const fact = (label, value) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`;
    els.detail.innerHTML = `
      <div>
        <p class="admin-kicker">Receipt ${statusPill(receipt)}</p>
        <h3>${escapeHtml(receipt.number)}</h3>
      </div>
      <p class="admin-receipt-sent ${receipt.sentAt ? 'is-sent' : 'is-unsent'}">
        <i data-lucide="${receipt.sentAt ? 'mail-check' : 'mail-warning'}"></i>
        <span>${receipt.sentAt
          ? `Emailed to <strong>${escapeHtml(receipt.sentTo)}</strong> on ${escapeHtml(new Date(receipt.sentAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}.`
          : `Not sent yet. It will go to <strong>${escapeHtml(invoice.clientEmail)}</strong>.`}</span>
      </p>
      <dl class="admin-detail-facts">
        ${fact('Client', invoice.clientName)}
        ${fact('Invoice', invoice.number)}
        ${fact('Amount paid', pdf.money(receipt.amount, invoice.currency))}
        ${fact('Date paid', pdf.longDate(receipt.paidOn))}
        ${fact('Payment channel', receipt.channel)}
        ${fact('Invoice balance now', balanceNow > 0 ? pdf.money(balanceNow, invoice.currency) : 'Paid in full')}
      </dl>
      <div class="admin-receipt-actions">
        <button class="admin-button admin-button-primary" data-receipt-action="send" type="button"><i data-lucide="send"></i> ${receipt.sentAt ? 'Send again' : 'Send to client'}</button>
        <button class="admin-button admin-button-quiet" data-receipt-action="download" type="button"><i data-lucide="download"></i> Download PDF</button>
        ${balanceNow > 0 ? '<button class="admin-button admin-button-quiet" data-receipt-action="next-payment" type="button"><i data-lucide="plus"></i> Record next payment</button>' : ''}
        ${receipt.sentAt ? '' : '<button class="admin-button admin-button-danger" data-receipt-action="delete" type="button"><i data-lucide="trash-2"></i> Delete</button>'}
      </div>`;
    refreshIcons();
  }

  async function download() {
    const receipt = state.receipts.find((item) => item.id === state.viewingId);
    if (!receipt) return;
    try {
      const bytes = await pdf.render({ invoice: invoiceById(receipt.invoiceId), receipt, history: historyFor(receipt) });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      link.download = `Receipt-${receipt.number.replace(/\s+/g, '-')}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch (error) {
      showMessage(els.notice, error.message || 'The PDF could not be made.', true);
    }
  }

  async function remove() {
    const receipt = state.receipts.find((item) => item.id === state.viewingId);
    if (!receipt || receipt.sentAt) return;
    const ok = await confirmDialog({
      title: 'Delete this receipt?',
      body: `<p>Receipt <strong>${escapeHtml(receipt.number)}</strong> was never sent, so the client hasn't seen it. Deleting it can't be undone.</p>`,
      confirm: 'Delete receipt',
      danger: true
    });
    if (!ok) return;
    try {
      await api.deleteReceipt(receipt.id);
      state.receipts = state.receipts.filter((item) => item.id !== receipt.id);
      // The server also removes an invoice left with no receipts.
      if (!state.receipts.some((item) => item.invoiceId === receipt.invoiceId)) state.invoices = state.invoices.filter((item) => item.id !== receipt.invoiceId);
      showIndex();
      showMessage(els.notice, `Receipt ${receipt.number} deleted.`);
    } catch (error) {
      if (error.status === 401) { handleError(error); return; }
      showMessage(els.notice, error.message || 'The receipt could not be deleted.', true);
    }
  }

  // ---- Dialog ----

  function confirmDialog({ title, body, confirm, danger = false }) {
    const dialog = els.dialog;
    dialog.querySelector('[data-dialog-title]').textContent = title;
    dialog.querySelector('[data-dialog-body]').innerHTML = body;
    const button = dialog.querySelector('[data-dialog-confirm]');
    button.textContent = confirm;
    button.className = `admin-button ${danger ? 'admin-button-danger' : 'admin-button-primary'}`;
    dialog.returnValue = '';
    dialog.showModal();
    button.focus();
    return new Promise((resolve) => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    });
  }

  // ---- Events ----

  document.addEventListener('admin:tab', (event) => {
    if (event.detail !== 'receipts') return;
    const [, target] = window.location.hash.slice(1).split('/');
    load().then(() => {
      if (target === 'new') openNew();
      else if (target && state.receipts.some((receipt) => receipt.id === target)) openReceipt(target);
      else if (state.mode === 'index') showIndex();
      else if (state.mode === 'view') history.replaceState(null, '', `#receipts/${state.viewingId}`);
      else history.replaceState(null, '', '#receipts/new');
    });
  });

  // The dashboard's refresh button reloads receipts too, but never throws away a half-filled form.
  document.addEventListener('admin:refresh', () => { if (state.loaded && state.mode !== 'new') load(true); });

  $('newReceiptButton').addEventListener('click', () => load().then(() => openNew()));
  els.search.addEventListener('input', (event) => { state.query = event.target.value.trim().toLowerCase(); renderIndex(); });
  els.list.addEventListener('click', (event) => {
    const row = event.target.closest('[data-open-receipt]');
    if (row) openReceipt(row.dataset.openReceipt);
  });

  els.form.addEventListener('input', (event) => {
    if (event.target.name === 'invoiceId') return;
    updateSummary();
    schedulePreview();
  });
  els.form.addEventListener('change', (event) => {
    if (event.target.name === 'invoiceId') fillInvoice(invoiceById(event.target.value));
    else if (event.target.name === 'currency') { updateSummary(); schedulePreview(); }
  });
  els.form.addEventListener('submit', (event) => { event.preventDefault(); save({ send: true }); });

  els.workspace.addEventListener('click', (event) => {
    const button = event.target.closest('[data-receipt-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.receiptAction;
    if (action === 'close') showIndex();
    else if (action === 'add-item') {
      const { invoice } = readForm();
      renderItems([...invoice.items, { description: '', quantity: 1, unitPrice: NaN }]);
      els.items.querySelector('.admin-receipt-item:last-child textarea').focus();
      updateSummary();
      schedulePreview();
    } else if (action === 'remove-item') {
      button.closest('.admin-receipt-item').remove();
      updateItemControls();
      updateSummary();
      schedulePreview();
    } else if (action === 'save') save({ send: false });
    else if (action === 'send') sendReceipt(state.viewingId);
    else if (action === 'download') download();
    else if (action === 'delete') remove();
    else if (action === 'next-payment') {
      const receipt = state.receipts.find((item) => item.id === state.viewingId);
      openNew(receipt.invoiceId);
    } else if (action === 'open-preview' && state.previewUrl) window.open(state.previewUrl, '_blank', 'noopener');
  });

  // ---- Utilities ----

  function toBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  function showMessage(element, message, error = false) {
    element.textContent = message;
    element.className = `admin-message${message ? (error ? ' error' : ' success') : ''}`;
  }

  function refreshIcons() { window.lucide?.createIcons(); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character])); }
})();
