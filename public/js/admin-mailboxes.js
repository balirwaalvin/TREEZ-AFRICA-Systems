/* ============================================
   TREEZ AFRICA SYSTEMS — Admin: Mailboxes
   Issue @treez.tech mailboxes for /mail/, reset their passwords, switch them off or delete them.
   ============================================ */

(() => {
  const api = window.TREEZ_API.admin;
  const $ = (id) => document.getElementById(id);
  const els = {
    notice: $('mailboxNotice'),
    list: $('mailboxList'),
    form: $('mailboxForm'),
    formMessage: $('mailboxFormMessage'),
    dialog: $('mailboxDialog'),
    domainNote: $('mailboxDomainNote')
  };
  const state = { mailboxes: [], domain: 'treez.tech', loaded: false, loading: null };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const icons = () => window.lucide?.createIcons();
  const when = (value) => (value ? new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Never');

  function showMessage(element, message, error = false) {
    element.textContent = message;
    element.className = `admin-message${message ? (error ? ' error' : ' success') : ''}`;
  }

  /** 16 characters from an alphabet without look-alikes (no 0/O, 1/l/I). */
  function generatePassword() {
    const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('').replace(/(.{4})(?!$)/g, '$1-');
  }

  function load(force = false) {
    if (state.loaded && !force) return Promise.resolve();
    state.loading ||= api.mailboxes().then((data) => {
      state.mailboxes = data.documents;
      state.domain = data.domain;
      state.loaded = true;
      els.domainNote.textContent = `@${state.domain}`;
      document.querySelectorAll('[data-mailbox-domain]').forEach((element) => { element.textContent = `@${state.domain}`; });
      render();
    }).catch((error) => {
      if (error.status === 401) { window.location.reload(); return; }
      showMessage(els.notice, error.message || 'Could not load mailboxes.', true);
    }).finally(() => { state.loading = null; });
    return state.loading;
  }

  function render() {
    if (!state.mailboxes.length) {
      els.list.innerHTML = '<p class="admin-empty">No mailboxes yet. Create one to start sending and receiving mail at /mail/.</p>';
      return;
    }
    els.list.innerHTML = state.mailboxes.map((mailbox) => `
      <article class="admin-mailbox-row${mailbox.disabled ? ' is-disabled' : ''}">
        <div class="admin-mailbox-who">
          <strong>${escapeHtml(mailbox.address)}</strong>
          <span>${escapeHtml(mailbox.displayName)}${mailbox.disabled ? ' · <em>Switched off</em>' : ''}</span>
          ${mailbox.aliases.length ? `<span class="admin-mailbox-aliases">Also receives ${mailbox.aliases.map((alias) => `<code>${escapeHtml(alias)}</code>`).join(' ')}</span>` : ''}
        </div>
        <dl class="admin-mailbox-facts">
          <div><dt>Emails</dt><dd>${mailbox.messages}</dd></div>
          <div><dt>Unread</dt><dd>${mailbox.unread}</dd></div>
          <div><dt>Last sign-in</dt><dd>${escapeHtml(when(mailbox.lastLoginAt))}</dd></div>
        </dl>
        <div class="admin-mailbox-actions">
          <button class="admin-button admin-button-quiet" data-mailbox-action="rename" data-id="${escapeHtml(mailbox.id)}" type="button"><i data-lucide="pencil"></i> Rename</button>
          <button class="admin-button admin-button-quiet" data-mailbox-action="aliases" data-id="${escapeHtml(mailbox.id)}" type="button"><i data-lucide="at-sign"></i> Extra addresses</button>
          <button class="admin-button admin-button-quiet" data-mailbox-action="password" data-id="${escapeHtml(mailbox.id)}" type="button"><i data-lucide="key-round"></i> New password</button>
          <button class="admin-button admin-button-quiet" data-mailbox-action="toggle" data-id="${escapeHtml(mailbox.id)}" type="button"><i data-lucide="${mailbox.disabled ? 'power' : 'power-off'}"></i> ${mailbox.disabled ? 'Switch on' : 'Switch off'}</button>
          ${mailbox.disabled ? `<button class="admin-button admin-button-danger" data-mailbox-action="delete" data-id="${escapeHtml(mailbox.id)}" type="button"><i data-lucide="trash-2"></i> Delete</button>` : ''}
        </div>
      </article>`).join('');
    icons();
  }

  /**
   * Opens the dialog and waits for confirmation. `run` is called with the dialog's form;
   * if it throws, the error is shown and the dialog stays open.
   */
  function ask({ title, body, confirm, danger = false, run }) {
    const { dialog } = els;
    const form = dialog.querySelector('form');
    dialog.querySelector('[data-dialog-title]').textContent = title;
    dialog.querySelector('[data-dialog-body]').innerHTML = body;
    const message = dialog.querySelector('[data-dialog-message]');
    showMessage(message, '');
    const button = dialog.querySelector('[data-dialog-confirm]');
    button.textContent = confirm;
    button.className = `admin-button ${danger ? 'admin-button-danger' : 'admin-button-primary'}`;
    // Enter in a field submits too, so anything but Cancel confirms.
    const submit = async (event) => {
      event.preventDefault();
      button.disabled = true;
      try {
        await run(form);
        dialog.close();
      } catch (error) {
        showMessage(message, error.message || 'That did not work.', true);
      } finally {
        button.disabled = false;
      }
    };
    form.addEventListener('submit', submit);
    dialog.addEventListener('close', () => form.removeEventListener('submit', submit), { once: true });
    dialog.returnValue = '';
    dialog.showModal();
    icons();
    (dialog.querySelector('input') ?? button).focus();
  }

  function replace(updated) {
    state.mailboxes = state.mailboxes.map((mailbox) => (mailbox.id === updated.id ? updated : mailbox));
    render();
  }

  function openForm(open = true) {
    els.form.hidden = !open;
    if (!open) return;
    els.form.reset();
    els.form.elements.password.value = generatePassword();
    showMessage(els.formMessage, '');
    els.form.elements.address.focus();
  }

  els.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = els.form.elements;
    if (form.password.value.length < 12) { showMessage(els.formMessage, 'Use at least 12 characters for the password.', true); return; }
    showMessage(els.formMessage, 'Creating…');
    try {
      const mailbox = await api.createMailbox({ address: form.address.value.trim(), displayName: form.displayName.value.trim(), password: form.password.value });
      state.mailboxes = [...state.mailboxes, mailbox].sort((a, b) => a.address.localeCompare(b.address));
      render();
      els.form.hidden = true;
      showMessage(els.notice, `${mailbox.address} is ready. Share its password privately; it can sign in at /mail/.`);
    } catch (error) {
      showMessage(els.formMessage, error.message || 'Could not create the mailbox.', true);
    }
  });

  document.querySelector('[data-view="mailboxes"]').addEventListener('click', (event) => {
    const button = event.target.closest('[data-mailbox-action]');
    if (!button) return;
    const action = button.dataset.mailboxAction;
    const mailbox = state.mailboxes.find((item) => item.id === button.dataset.id);
    if (action === 'generate') { els.form.elements.password.value = generatePassword(); return; }
    if (action === 'cancel') { openForm(false); return; }
    if (!mailbox) return;
    const who = `<strong>${escapeHtml(mailbox.address)}</strong>`;

    if (action === 'rename') {
      ask({
        title: 'Rename mailbox',
        body: `<label>Name shown to recipients<input name="displayName" value="${escapeHtml(mailbox.displayName)}" required maxlength="120"></label>`,
        confirm: 'Save',
        run: async (form) => replace(await api.updateMailbox(mailbox.id, { displayName: form.elements.displayName.value.trim() }))
      });
    } else if (action === 'aliases') {
      ask({
        title: 'Extra addresses',
        body: `<p>Mail to these addresses lands in ${who}'s inbox, and it can send as them too. One per line, for example <code>care</code> or <code>care@${escapeHtml(state.domain)}</code>.</p><label>Addresses<textarea name="aliases" rows="5" spellcheck="false" autocapitalize="none">${escapeHtml(mailbox.aliases.join('\n'))}</textarea></label>`,
        confirm: 'Save addresses',
        run: async (form) => {
          const aliases = form.elements.aliases.value.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
          replace(await api.updateMailbox(mailbox.id, { aliases }));
          showMessage(els.notice, aliases.length ? `${mailbox.address} now also receives ${aliases.length} other ${aliases.length === 1 ? 'address' : 'addresses'}.` : `${mailbox.address} only receives its own address now.`);
        }
      });
    } else if (action === 'password') {
      ask({
        title: 'Set a new password',
        body: `<p>${who} will be signed out everywhere and need this password to sign in again.</p><label>New password<input name="password" type="text" autocomplete="off" spellcheck="false" minlength="12" value="${escapeHtml(generatePassword())}" required></label>`,
        confirm: 'Set password',
        run: async (form) => {
          const password = form.elements.password.value;
          if (password.length < 12) throw new Error('Use at least 12 characters.');
          replace(await api.updateMailbox(mailbox.id, { password }));
          showMessage(els.notice, `New password set for ${mailbox.address}. Share it privately.`);
        }
      });
    } else if (action === 'toggle') {
      const off = !mailbox.disabled;
      ask({
        title: off ? 'Switch this mailbox off?' : 'Switch this mailbox on?',
        body: off
          ? `<p>${who} will be signed out and can't sign in. Mail sent to it stops being filed until it's switched on again. Nothing in it is deleted.</p>`
          : `<p>${who} will be able to sign in and receive mail again.</p>`,
        confirm: off ? 'Switch off' : 'Switch on',
        danger: off,
        run: async () => replace(await api.updateMailbox(mailbox.id, { disabled: off }))
      });
    } else if (action === 'delete') {
      ask({
        title: 'Delete this mailbox?',
        body: `<p>${who} and all ${mailbox.messages} of its emails and attachments will be deleted for good. This can't be undone.</p><label>Type the address to confirm<input name="confirm" autocomplete="off" spellcheck="false" required></label>`,
        confirm: 'Delete mailbox',
        danger: true,
        run: async (form) => {
          if (form.elements.confirm.value.trim().toLowerCase() !== mailbox.address) throw new Error("The address doesn't match.");
          await api.deleteMailbox(mailbox.id);
          state.mailboxes = state.mailboxes.filter((item) => item.id !== mailbox.id);
          render();
          showMessage(els.notice, `${mailbox.address} was deleted.`);
        }
      });
    }
  });

  els.dialog.querySelector('[data-dialog-cancel]').addEventListener('click', () => els.dialog.close());
  $('newMailboxButton').addEventListener('click', () => load().then(() => openForm()));
  document.addEventListener('admin:tab', (event) => { if (event.detail === 'mailboxes') load(); });
  document.addEventListener('admin:refresh', () => { if (state.loaded) load(true); });
})();
