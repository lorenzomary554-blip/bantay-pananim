// ============================================================
// Bantay Pananim v1.0 — Confirmation Modal Handler
// Intercepts form submissions and shows confirmation dialog
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  const modal = document.getElementById('confirm-modal');
  const modalMessage = document.getElementById('confirm-modal-message');
  const cancelBtn = document.getElementById('confirm-cancel-btn');
  const okBtn = document.getElementById('confirm-ok-btn');
  const backdrop = document.getElementById('confirm-backdrop');

  if (!modal || !modalMessage || !cancelBtn || !okBtn) return;

  let pendingForm = null;

  // Find all forms with data-confirm="true"
  function attachConfirmHandlers() {
    const forms = document.querySelectorAll('form[data-confirm="true"]');

    forms.forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        pendingForm = form;

        const message = form.dataset.confirmMessage || 'Do you want to continue with this action?';
        modalMessage.textContent = message;

        // Show modal
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');

        // Focus the cancel button for accessibility
        setTimeout(function () {
          cancelBtn.focus();
        }, 100);
      });
    });
  }

  // Cancel — close modal
  cancelBtn.addEventListener('click', function () {
    closeModal();
  });

  // Backdrop click — close modal
  if (backdrop) {
    backdrop.addEventListener('click', function () {
      closeModal();
    });
  }

  // OK — submit form
  okBtn.addEventListener('click', function () {
    if (pendingForm) {
      // Remove the data-confirm to prevent infinite loop
      pendingForm.removeAttribute('data-confirm');
      pendingForm.submit();
    }
    closeModal();
  });

  // Escape key — close modal
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  function closeModal() {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    pendingForm = null;
  }

  // Initialize
  attachConfirmHandlers();
});
