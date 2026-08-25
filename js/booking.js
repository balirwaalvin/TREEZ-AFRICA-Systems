/* ============================================
   TREEZ AFRICA SYSTEMS — Booking Form
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('bookingForm');
  if (!form) return;

  const steps = document.querySelectorAll('.form-step');
  const progressSteps = document.querySelectorAll('.progress-step');
  const progressFill = document.querySelector('.progress-fill');
  const successEl = document.querySelector('.booking-success');
  let currentStep = 0;

  // ---- Step Navigation ----
  function showStep(index) {
    steps.forEach((step, i) => {
      step.classList.toggle('active', i === index);
    });

    progressSteps.forEach((step, i) => {
      step.classList.remove('active', 'completed');
      if (i < index) step.classList.add('completed');
      if (i === index) step.classList.add('active');
    });

    // Update progress bar fill
    const percent = (index / (steps.length - 1)) * 100;
    if (progressFill) progressFill.style.width = `${percent}%`;

    currentStep = index;
  }

  // Next buttons
  document.querySelectorAll('.btn-next').forEach(btn => {
    btn.addEventListener('click', () => {
      if (validateStep(currentStep)) {
        if (currentStep === steps.length - 1) {
          // Last step - show review
          populateReview();
        }
        if (currentStep < steps.length - 1) {
          showStep(currentStep + 1);
          if (currentStep === steps.length - 1) {
            populateReview();
          }
        }
      }
    });
  });

  // Back buttons
  document.querySelectorAll('.btn-back').forEach(btn => {
    btn.addEventListener('click', () => {
      if (currentStep > 0) {
        showStep(currentStep - 1);
      }
    });
  });

  // ---- Validation ----
  function validateStep(stepIndex) {
    const step = steps[stepIndex];
    const requiredInputs = step.querySelectorAll('[required]');
    let isValid = true;

    requiredInputs.forEach(input => {
      removeError(input);

      if (!input.value.trim()) {
        showError(input, 'This field is required');
        isValid = false;
      } else if (input.type === 'email' && !isValidEmail(input.value)) {
        showError(input, 'Please enter a valid email');
        isValid = false;
      } else if (input.type === 'tel' && !isValidPhone(input.value)) {
        showError(input, 'Please enter a valid phone number');
        isValid = false;
      }
    });

    // Step 2: at least one service selected
    if (stepIndex === 1) {
      const checked = step.querySelectorAll('.checkbox-item.selected');
      if (checked.length === 0) {
        const group = step.querySelector('.checkbox-group');
        if (group) {
          group.style.border = '2px solid #e74c3c';
          group.style.borderRadius = '8px';
          group.style.padding = '8px';
          setTimeout(() => {
            group.style.border = '';
            group.style.borderRadius = '';
            group.style.padding = '';
          }, 3000);
        }
        isValid = false;
      }
    }

    return isValid;
  }

  function showError(input, message) {
    input.style.borderColor = '#e74c3c';
    const error = document.createElement('span');
    error.className = 'field-error';
    error.textContent = message;
    error.style.cssText = 'color:#e74c3c;font-size:0.75rem;margin-top:4px;display:block;';
    input.parentElement.appendChild(error);
  }

  function removeError(input) {
    input.style.borderColor = '';
    const existing = input.parentElement.querySelector('.field-error');
    if (existing) existing.remove();
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function isValidPhone(phone) {
    return /^[\d\s\+\-\(\)]{7,}$/.test(phone);
  }

  // ---- Checkbox/Radio Selection ----
  document.querySelectorAll('.checkbox-item').forEach(item => {
    item.addEventListener('click', () => {
      item.classList.toggle('selected');
      const input = item.querySelector('input');
      if (input) input.checked = item.classList.contains('selected');
    });
  });

  document.querySelectorAll('.budget-option').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.budget-option').forEach(opt => opt.classList.remove('selected'));
      item.classList.add('selected');
      const input = item.querySelector('input');
      if (input) input.checked = true;
    });
  });

  // ---- Populate Review ----
  function populateReview() {
    const getName = () => {
      const fn = form.querySelector('[name="firstName"]');
      const ln = form.querySelector('[name="lastName"]');
      return `${fn?.value || ''} ${ln?.value || ''}`.trim();
    };

    const setReview = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value || 'Not provided';
    };

    setReview('reviewName', getName());
    setReview('reviewEmail', form.querySelector('[name="email"]')?.value);
    setReview('reviewPhone', form.querySelector('[name="phone"]')?.value);
    setReview('reviewCompany', form.querySelector('[name="company"]')?.value);

    // Services
    const services = [];
    form.querySelectorAll('.checkbox-item.selected .checkbox-label').forEach(el => {
      services.push(el.textContent);
    });
    setReview('reviewServices', services.join(', '));

    // Budget
    const selectedBudget = form.querySelector('.budget-option.selected .amount');
    setReview('reviewBudget', selectedBudget?.textContent);

    // Timeline
    setReview('reviewTimeline', form.querySelector('[name="timeline"]')?.value);

    // Description
    setReview('reviewDescription', form.querySelector('[name="description"]')?.value);
  }

  // ---- Form Submit ----
  document.querySelector('.btn-submit')?.addEventListener('click', (e) => {
    e.preventDefault();

    // Simulate submission
    const submitBtn = e.target;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Submitting...';

    setTimeout(() => {
      // Hide form, show success
      form.style.display = 'none';
      document.querySelector('.form-progress')?.style.setProperty('display', 'none');
      if (successEl) successEl.classList.add('active');

      submitBtn.disabled = false;
      submitBtn.innerHTML = 'Submit Booking';
    }, 2000);
  });

  // Initialize
  showStep(0);
});

