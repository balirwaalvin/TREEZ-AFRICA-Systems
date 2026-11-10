/* ============================================
   TREEZ AFRICA SYSTEMS — eReceipt PDF renderer
   Draws the receipt in the browser with pdf-lib, matching the TAH eReceipt template.
   The same bytes are shown in the admin preview and attached to the client's email.
   ============================================ */

window.TreezReceipt = (() => {
  const LIBRARIES = [
    ['https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js', 'sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI'],
    ['https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js', 'sha384-2p6U+1mmqF10USehFeRiyG2ESG9FwIqN+jxULn5w9jjQIihSn9Pt13dVCn/Hawjn']
  ];
  const ASSETS = {
    regular: '/assets/fonts/NotoSans-Regular.ttf',
    bold: '/assets/fonts/NotoSans-Bold.ttf',
    logo: '/assets/images/receipt-logo.png'
  };

  // The issuer block printed on every receipt.
  const SELLER = {
    name: 'TREEZ AFRICA SYSTEMS,',
    suffix: ' TAS',
    lines: ['26278 Kampala', 'VES 5598', 'Namirembe Road, Kampala 26278', 'Uganda', 'support@treez.tech']
  };

  // ---- Formatting (kept in step with src/receipts.ts) ----
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /** "2026-10-02" → "October 2, 2026" */
  function longDate(value) {
    const [year, month, day] = String(value || '').split('-').map(Number);
    if (!year || !month || !day) return '';
    return `${MONTHS[month - 1]} ${day}, ${year}`;
  }

  /** 120000000, "UGX" → "UGX1,200,000.00" */
  function money(cents, currency) {
    const value = Math.round(Number(cents) || 0);
    const sign = value < 0 ? '-' : '';
    const whole = Math.floor(Math.abs(value) / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${sign}${currency}${whole}.${String(Math.abs(value) % 100).padStart(2, '0')}`;
  }

  const lineAmount = (item) => Math.round(item.quantity * item.unitPrice);
  const total = (items) => items.reduce((sum, item) => sum + lineAmount(item), 0);
  const quantityText = (quantity) => String(Number(quantity.toFixed(2)));
  /** "TAH 8989 4402" → "8989 4402", as printed in the payment history table. */
  const shortNumber = (number) => String(number).replace(/^[A-Za-z]+\s+/, '');

  // ---- Loading ----
  function loadScript(src, integrity) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.integrity = integrity;
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = () => reject(new Error('The PDF tools could not load. Check your connection and try again.'));
      document.head.appendChild(script);
    });
  }

  let assets = null;
  function load() {
    assets ||= (async () => {
      for (const [src, integrity] of LIBRARIES) await loadScript(src, integrity);
      const files = await Promise.all(Object.values(ASSETS).map(async (path) => {
        const response = await fetch(path);
        if (!response.ok) throw new Error('The receipt fonts or logo could not load.');
        return response.arrayBuffer();
      }));
      return Object.fromEntries(Object.keys(ASSETS).map((key, index) => [key, files[index]]));
    })();
    assets.catch(() => { assets = null; });
    return assets;
  }

  // ---- Layout, in points on US Letter (612 × 792), measured from the sample receipts ----
  const PAGE = { width: 612, height: 792 };
  const LEFT = 30;
  const RIGHT = 582;
  const TOP = 48;
  const BOTTOM = 712;
  const FOOTER_RULE = 731.5;
  const SIZE = { title: 20, heading: 13.5, body: 9, small: 7.5 };
  const LINE = 13.5;       // address and meta lines
  const ITEM_LINE = 12.3;  // lines inside one item description
  const ROW = 17.4;        // table rows
  const TOTAL_ROW = 14.2;  // total / balance / amount paid rows
  const BILL_TO_X = 251;
  const META_VALUE_X = LEFT + 75;
  const LOGO = { x: 484, top: 16, width: 84 };
  const ITEM_COLUMNS = { qty: 346.5, unit: 443.5, description: 280 };
  const HISTORY_COLUMNS = { date: 315, amount: 414.6 };
  const TOTALS_X = 306;

  /**
   * Builds the receipt PDF.
   * @param {{ invoice: object, receipt: object, history: object[] }} data
   *   history is every payment on the invoice up to and including this receipt, oldest first.
   * @returns {Promise<Uint8Array>}
   */
  async function render({ invoice, receipt, history }) {
    const files = await load();
    const { PDFDocument, rgb } = window.PDFLib;
    const ink = rgb(0.1, 0.1, 0.1);
    const rule = rgb(0.89, 0.9, 0.91);

    const doc = await PDFDocument.create();
    doc.registerFontkit(window.fontkit);
    const regular = await doc.embedFont(files.regular);
    const bold = await doc.embedFont(files.bold);
    const logo = await doc.embedPng(files.logo);
    doc.setTitle(`eReceipt ${receipt.number}`);
    doc.setAuthor('TREEZ AFRICA SYSTEMS');
    doc.setCreator('TREEZ AFRICA SYSTEMS');
    doc.setProducer('TREEZ AFRICA SYSTEMS');
    doc.setCreationDate(new Date());

    let page;
    let y; // baseline of the next line, measured from the top of the page

    function addPage() {
      page = doc.addPage([PAGE.width, PAGE.height]);
      page.drawLine({ start: { x: LEFT, y: PAGE.height - FOOTER_RULE }, end: { x: RIGHT, y: PAGE.height - FOOTER_RULE }, thickness: 0.75, color: rule });
      y = TOP;
    }

    /** Starts a new page when `height` more points won't fit; returns true if it did. */
    function ensure(height) {
      if (y + height <= BOTTOM) return false;
      addPage();
      return true;
    }

    function text(value, x, baseline, { font = regular, size = SIZE.body, align = 'left' } = {}) {
      const string = String(value ?? '');
      const width = font.widthOfTextAtSize(string, size);
      const left = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
      page.drawText(string, { x: left, y: PAGE.height - baseline, size, font, color: ink });
      return width;
    }

    function line(x1, x2, at, thickness, color) {
      page.drawLine({ start: { x: x1, y: PAGE.height - at }, end: { x: x2, y: PAGE.height - at }, thickness, color });
    }

    /** Splits on line breaks, then wraps each line to `width`. */
    function wrap(value, width, font = regular, size = SIZE.body) {
      return String(value || '').split(/\r?\n/).flatMap((paragraph) => {
        const words = paragraph.trim().split(/\s+/).filter(Boolean);
        if (!words.length) return [];
        const lines = [];
        let current = '';
        for (const word of words) {
          const next = current ? `${current} ${word}` : word;
          if (current && font.widthOfTextAtSize(next, size) > width) { lines.push(current); current = word; } else current = next;
        }
        lines.push(current);
        return lines;
      });
    }

    addPage();

    // Title, meta and logo
    text('eReceipt', LEFT, 48.8, { font: bold, size: SIZE.title });
    const logoHeight = (LOGO.width * logo.height) / logo.width;
    page.drawImage(logo, { x: LOGO.x, y: PAGE.height - LOGO.top - logoHeight, width: LOGO.width, height: logoHeight });
    const meta = [['Invoice number', invoice.number, bold], ['Receipt number', receipt.number, regular], ['Date paid', longDate(receipt.paidOn), regular]];
    meta.forEach(([label, value, font], index) => {
      const baseline = 77.8 + index * LINE;
      text(label, LEFT, baseline, { font });
      text(value, META_VALUE_X, baseline, { font });
    });

    // Issuer and bill-to blocks
    const nameWidth = text(SELLER.name, LEFT, 135, { font: bold });
    text(SELLER.suffix, LEFT + nameWidth, 135);
    SELLER.lines.forEach((value, index) => text(value, LEFT, 151.5 + index * LINE));
    const sellerEnd = 151.5 + (SELLER.lines.length - 1) * LINE;

    text('Bill to', BILL_TO_X, 135, { font: bold });
    const contact = [invoice.clientEmail, invoice.clientPhone].filter(Boolean).join(' | ');
    const billLines = [
      ...wrap(invoice.clientName, RIGHT - BILL_TO_X),
      ...wrap(invoice.clientAddress, RIGHT - BILL_TO_X),
      ...wrap(contact, RIGHT - BILL_TO_X)
    ];
    billLines.forEach((value, index) => text(value, BILL_TO_X, 151.5 + index * LINE));
    const billEnd = 151.5 + (billLines.length - 1) * LINE;

    // Headline
    y = Math.max(sellerEnd, billEnd) + 38.4;
    text(`${money(receipt.amount, invoice.currency)} paid on ${longDate(receipt.paidOn)}`, LEFT, y, { font: bold, size: SIZE.heading });

    // Line items
    function itemHeader() {
      text('Description', LEFT, y, { size: SIZE.small });
      text('Qty', ITEM_COLUMNS.qty, y, { size: SIZE.small, align: 'center' });
      text('Unit price', ITEM_COLUMNS.unit, y, { size: SIZE.small, align: 'center' });
      text('Amount', RIGHT, y, { size: SIZE.small, align: 'right' });
      line(LEFT, RIGHT, y + 8.2, 0.9, ink);
      y += 8.2 + 14.1;
    }
    y += 36.5;
    itemHeader();
    invoice.items.forEach((item, index) => {
      const lines = wrap(item.description, ITEM_COLUMNS.description);
      if (index > 0) y += ROW;
      if (ensure((lines.length - 1) * ITEM_LINE)) itemHeader();
      text(quantityText(item.quantity), ITEM_COLUMNS.qty, y, { align: 'center' });
      text(money(item.unitPrice, invoice.currency), ITEM_COLUMNS.unit, y, { align: 'center' });
      text(money(lineAmount(item), invoice.currency), RIGHT, y, { align: 'right' });
      lines.forEach((value, lineIndex) => text(value, LEFT, y + lineIndex * ITEM_LINE));
      y += (lines.length - 1) * ITEM_LINE;
    });

    // Totals
    const paid = history.reduce((sum, payment) => sum + payment.amount, 0);
    const invoiceTotal = total(invoice.items);
    const totals = [
      ['Total', money(invoiceTotal, invoice.currency), regular],
      ['Balance', money(invoiceTotal - paid, invoice.currency), regular],
      ['Amount paid', money(paid, invoice.currency), bold]
    ];
    y += 19.9;
    ensure(totals.length * TOTAL_ROW);
    line(TOTALS_X, RIGHT, y, 0.75, rule);
    totals.forEach(([label, value, font]) => {
      text(label, TOTALS_X, y + 10.3, { font });
      text(value, RIGHT, y + 10.3, { font, align: 'right' });
      y += TOTAL_ROW;
      line(TOTALS_X, RIGHT, y, 0.75, rule);
    });

    // Payment history
    y += 36;
    // Keep the heading with its table header and first row.
    ensure(36 + 8.2 + 13.5);
    text('Payment history', LEFT, y, { font: bold, size: SIZE.heading });
    function historyHeader() {
      text('Payment channel', LEFT, y, { size: SIZE.small });
      text('Date', HISTORY_COLUMNS.date, y, { size: SIZE.small });
      text('Amount paid', HISTORY_COLUMNS.amount, y, { size: SIZE.small });
      text('Receipt number', RIGHT, y, { size: SIZE.small, align: 'right' });
      line(LEFT, RIGHT, y + 8.2, 0.9, ink);
      y += 8.2 + 13.5;
    }
    y += 36;
    historyHeader();
    history.forEach((payment, index) => {
      if (index > 0) y += ROW;
      if (ensure(0)) historyHeader();
      const channel = wrap(payment.channel, HISTORY_COLUMNS.date - LEFT - 12)[0] || '';
      text(channel, LEFT, y);
      text(longDate(payment.paidOn), HISTORY_COLUMNS.date, y);
      text(money(payment.amount, invoice.currency), HISTORY_COLUMNS.amount, y);
      text(shortNumber(payment.number), RIGHT, y, { align: 'right' });
    });

    return doc.save();
  }

  return { render, load, money, longDate, total, lineAmount };
})();
