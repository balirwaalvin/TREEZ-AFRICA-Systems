/* ============================================
   TREEZ AFRICA SYSTEMS — Contact Form JS
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('contactForm');
  if (!form) return;

  // ---- Form Validation & Submit ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Clear previous errors
    form.querySelectorAll('.field-error').forEach(el => el.remove());
    form.querySelectorAll('.form-input').forEach(el => el.style.borderColor = '');

    let isValid = true;

    // Validate required fields
    const fields = {
      name: { el: form.querySelector('[name="name"]'), msg: 'Please enter your name' },
      email: { el: form.querySelector('[name="email"]'), msg: 'Please enter a valid email' },
      subject: { el: form.querySelector('[name="subject"]'), msg: 'Please enter a subject' },
      message: { el: form.querySelector('[name="message"]'), msg: 'Please enter your message' }
    };

    Object.values(fields).forEach(field => {
      if (!field.el || !field.el.value.trim()) {
        showError(field.el, field.msg);
        isValid = false;
      }
    });

    // Email validation
    if (fields.email.el?.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.el.value)) {
      showError(fields.email.el, 'Please enter a valid email address');
      isValid = false;
    }

    if (!isValid) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Sending...';

    try {
      const formData = new FormData(form);
      await window.TREEZ_APPWRITE.databases.createDocument(
        window.APPWRITE_CONFIG.databaseId,
        window.APPWRITE_CONFIG.messagesCollectionId,
        window.TREEZ_APPWRITE.ID.unique(),
        Object.fromEntries(formData.entries())
      );
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;

      // Show success message
      const msg = document.querySelector('.form-message');
      if (msg) {
        msg.className = 'form-message success';
        msg.innerHTML = '<i class="bx bx-check-circle"></i> Thank you! Your message has been sent successfully. We\'ll get back to you within 24 hours.';
        msg.style.display = 'block';
      }

      form.reset();
    } catch (error) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
      const msg = document.querySelector('.form-message');
      if (msg) {
        msg.className = 'form-message error';
        msg.textContent = error.message || 'We could not send your message. Please try again.';
        msg.style.display = 'block';
      }
    }
  });

  function showError(input, message) {
    if (!input) return;
    input.style.borderColor = '#e74c3c';
    const error = document.createElement('span');
    error.className = 'field-error';
    error.textContent = message;
    error.style.cssText = 'color:#e74c3c;font-size:0.75rem;margin-top:4px;display:block;';
    input.parentElement.appendChild(error);
  }

  // ---- FAQ Accordion ----
  document.querySelectorAll('.faq-question').forEach(question => {
    question.addEventListener('click', () => {
      const item = question.parentElement;
      const isActive = item.classList.contains('active');

      // Close all
      document.querySelectorAll('.faq-item').forEach(faq => faq.classList.remove('active'));

      // Toggle current
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });
});

