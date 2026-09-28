// ============================================================
// Bantay Pananim v1.0 — Form Helpers
// Auto-expiry calculator and client-side validation
// ============================================================

// ===== Crop Info Display =====
function updateCropInfo(cropId) {
  const cropInfo = document.getElementById('crop-info');
  const infoShelfLife = document.getElementById('info-shelf-life');
  const infoMaxMoisture = document.getElementById('info-max-moisture');

  if (!cropId || !cropInfo) return;

  const select = document.getElementById('crop_id');
  const option = select.options[select.selectedIndex];

  if (option && option.dataset.shelfLife) {
    infoShelfLife.textContent = option.dataset.shelfLife;
    infoMaxMoisture.textContent = option.dataset.maxMoisture;
    cropInfo.classList.remove('hidden');
  } else {
    cropInfo.classList.add('hidden');
  }

  calculateExpiryPreview();
}

// ===== Expiry Preview Calculator =====
function calculateExpiryPreview() {
  const cropSelect = document.getElementById('crop_id');
  const moistureInput = document.getElementById('moisture_content');
  const dateInput = document.getElementById('date_received');
  const previewDiv = document.getElementById('expiry-preview');
  const expiryDateText = document.getElementById('expiry-date-text');
  const expiryDaysText = document.getElementById('expiry-days-text');
  const moistureWarning = document.getElementById('moisture-warning');

  if (!cropSelect || !moistureInput || !dateInput || !previewDiv) return;

  const cropOption = cropSelect.options[cropSelect.selectedIndex];
  const moisture = parseFloat(moistureInput.value);
  const dateReceived = dateInput.value;

  if (!cropOption || !cropOption.dataset.shelfLife || isNaN(moisture) || !dateReceived) {
    previewDiv.classList.add('hidden');
    return;
  }

  const shelfLife = parseInt(cropOption.dataset.shelfLife);
  const maxMoisture = parseFloat(cropOption.dataset.maxMoisture);

  // Calculate moisture ratio and multiplier
  const moistureRatio = moisture / maxMoisture;
  let multiplier;

  if (moistureRatio <= 0.8) {
    multiplier = 1.2;
  } else if (moistureRatio <= 1.0) {
    multiplier = 1.0;
  } else if (moistureRatio <= 1.2) {
    multiplier = 0.6;
  } else {
    multiplier = 0.3;
  }

  const adjustedDays = Math.floor(shelfLife * multiplier);

  // Calculate expiry date
  const received = new Date(dateReceived);
  received.setDate(received.getDate() + adjustedDays);
  const expiryDate = received.toISOString().split('T')[0];

  // Display
  expiryDateText.textContent = formatDate(expiryDate);
  expiryDaysText.textContent = adjustedDays;
  previewDiv.classList.remove('hidden');

  // Moisture warning
  if (moistureWarning) {
    if (moisture > maxMoisture) {
      moistureWarning.classList.remove('hidden');
    } else {
      moistureWarning.classList.add('hidden');
    }
  }
}

// ===== Date Formatter =====
function formatDate(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}
