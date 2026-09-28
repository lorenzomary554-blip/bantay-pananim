// ============================================================
// Bantay Pananim v1.0 — Dashboard Pie Chart (Chart.js)
// ============================================================

document.addEventListener('DOMContentLoaded', function () {
  const canvas = document.getElementById('status-pie-chart');
  if (!canvas) return;

  fetch('/api/chart-data')
    .then(response => response.json())
    .then(data => {
      renderStatusChart(data.statusCounts);
    })
    .catch(err => {
      console.error('Failed to load chart data:', err);
      canvas.parentElement.innerHTML = '<p class="text-center text-gray-500 text-lg py-10">📊 Chart data unavailable</p>';
    });
});

function renderStatusChart(statusCounts) {
  const canvas = document.getElementById('status-pie-chart');
  if (!canvas) return;

  const statusConfig = {
    Fresh: { color: '#40916c', label: '✅ Fresh (Safe)' },
    Warning: { color: '#e09f3e', label: '⏰ Warning (Sell Soon)' },
    Priority: { color: '#c1121f', label: '⚠️ Priority (Urgent!)' },
    Fulfilled: { color: '#6366f1', label: '✔️ Fulfilled (Sold)' },
    Spoiled: { color: '#6b7280', label: '🔴 Spoiled' },
  };

  const labels = [];
  const values = [];
  const colors = [];

  for (const item of statusCounts) {
    const config = statusConfig[item.status] || { color: '#94a3b8', label: item.status };
    labels.push(config.label);
    values.push(item.count);
    colors.push(config.color);
  }

  // Handle empty data
  if (values.length === 0 || values.every(v => v === 0)) {
    canvas.parentElement.innerHTML = '<p class="text-center text-gray-500 text-lg py-10">📊 No batch data to display yet.</p>';
    return;
  }

  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverBorderWidth: 4,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '40%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: {
              size: 16,
              family: "'Inter', sans-serif",
              weight: '600',
            },
            padding: 20,
            usePointStyle: true,
            pointStyleWidth: 20,
            color: '#1a1a2e',
          },
        },
        tooltip: {
          titleFont: {
            size: 18,
            family: "'Inter', sans-serif",
            weight: '700',
          },
          bodyFont: {
            size: 16,
            family: "'Inter', sans-serif",
          },
          padding: 16,
          cornerRadius: 12,
          callbacks: {
            label: function (context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const value = context.parsed;
              const percent = total > 0 ? Math.round((value / total) * 100) : 0;
              return ' ' + context.label + ': ' + value + ' batch(es) (' + percent + '%)';
            },
          },
        },
      },
    },
  });
}
