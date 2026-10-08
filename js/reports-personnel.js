Aero.onReady(function () {
  'use strict';

  var user = Aero.require(['personnel']);
  if (!user) return;

  var esc = Aero.esc;
  var fmtDate = Aero.fmtDate;
  var PAGE_SIZE = 25;
  var currentPage = 1;
  var filteredReports = [];
  var searchQuery = '';
  var typeFilter = '';
  var dateFrom = null;
  var dateTo = null;
  var searchDebounce = null;

  var reportsBody = Aero.el('reports-body');
  var reportsEmpty = Aero.el('reports-empty');
  var reportsWrap = Aero.el('reports-wrap');
  var pagination = Aero.el('pagination');
  var modalBackdrop = Aero.el('report-modal-backdrop');
  var detailModal = Aero.el('report-detail-modal');
  var detailClose = Aero.el('report-detail-close');
  var searchInput = Aero.el('report-search');
  var typeSelect = Aero.el('filter-type');
  var dateFromInput = Aero.el('filter-date-from');
  var dateToInput = Aero.el('filter-date-to');
  var clearDateBtn = Aero.el('clear-date-filter');

  function timeLabel(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '\u2014';
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function dateLabel(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '\u2014';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function typeBadge(type) {
    var label = Aero.REPORT_TYPE_LABELS[type] || type;
    var cls = 'badge-report-' + type.replace('_', '-');
    return '<span class="badge ' + cls + '">' + esc(label) + '</span>';
  }

  function statusBadge(status) {
    var cls = status === 'alert' ? 'badge-status-alert' : 'badge-status-normal';
    var label = status === 'alert' ? 'Alert' : 'Normal';
    return '<span class="badge ' + cls + '">' + esc(label) + '</span>';
  }

  function truncate(str, len) {
    if (!str) return '\u2014';
    return str.length > len ? esc(str.slice(0, len)) + '\u2026' : esc(str);
  }

  function loadReports() {
    var all = Aero.getReportsByUser(user.id);
    filteredReports = all;
    currentPage = 1;
    applyFilters();
    renderStats();
    renderTable();
    renderPagination();
  }

  function applyFilters() {
    filteredReports = Aero.getReportsByUser(user.id).filter(function (r) {
      if (searchQuery) {
        var q = searchQuery.toLowerCase();
        var haystack = (r.deviceRoom + ' ' + r.deviceId + ' ' + (r.note || '')).toLowerCase();
        if (haystack.indexOf(q) === -1) return false;
      }
      if (typeFilter && r.type !== typeFilter) return false;
      if (dateFrom) {
        var d = new Date(r.createdAt);
        if (d < dateFrom) return false;
      }
      if (dateTo) {
        var d = new Date(r.createdAt);
        var endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        if (d > endOfDay) return false;
      }
      return true;
    });
    currentPage = 1;
  }

  function parseDateInput(value) {
    if (!value) return null;
    var parts = value.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }

  function renderStats() {
    var total = filteredReports.length;
    var now = new Date();
    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    var thisMonth = filteredReports.filter(function (r) {
      return new Date(r.createdAt) >= monthStart;
    }).length;
    Aero.el('stat-total').textContent = total;
    Aero.el('stat-month').textContent = thisMonth;
  }

  function renderTable() {
    var start = (currentPage - 1) * PAGE_SIZE;
    var pageReports = filteredReports.slice(start, start + PAGE_SIZE);

    if (pageReports.length === 0) {
      reportsBody.innerHTML = '';
      reportsWrap.hidden = true;
      reportsEmpty.hidden = false;
      pagination.innerHTML = '';
      return;
    }

    reportsWrap.hidden = false;
    reportsEmpty.hidden = true;

    reportsBody.innerHTML = pageReports.map(function (report) {
      return (
        '<tr data-id="' + esc(report.id) + '" style="cursor:pointer">' +
        '<td>' + esc(report.deviceRoom) + '<br><span class="muted">' + esc(report.deviceId) + '</span></td>' +
        '<td>' + typeBadge(report.type) + '</td>' +
        '<td>' + dateLabel(report.createdAt) + '</td>' +
        '<td>' + timeLabel(report.createdAt) + '</td>' +
        '<td>' + truncate(report.note, 80) + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function renderPagination() {
    var totalPages = Math.ceil(filteredReports.length / PAGE_SIZE);
    if (totalPages <= 1) {
      pagination.innerHTML = '';
      return;
    }

    var html = '';
    var maxPages = 5;
    var startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
    var endPage = Math.min(totalPages, startPage + maxPages - 1);
    if (endPage - startPage + 1 < maxPages) {
      startPage = Math.max(1, endPage - maxPages + 1);
    }

    if (currentPage > 1) {
      html += '<button class="btn btn-ghost btn-sm" data-page="1" aria-label="First page">&laquo;</button>';
      html += '<button class="btn btn-ghost btn-sm" data-page="' + (currentPage - 1) + '" aria-label="Previous page">&lsaquo;</button>';
    }

    for (var p = startPage; p <= endPage; p++) {
      html += '<button class="btn btn-sm ' + (p === currentPage ? 'btn-primary' : 'btn-ghost') + '" data-page="' + p + '">' + p + '</button>';
    }

    if (currentPage < totalPages) {
      html += '<button class="btn btn-ghost btn-sm" data-page="' + (currentPage + 1) + '" aria-label="Next page">&rsaquo;</button>';
      html += '<button class="btn btn-ghost btn-sm" data-page="' + totalPages + '" aria-label="Last page">&raquo;</button>';
    }

    pagination.innerHTML = html;
  }

  function openDetailModal(report) {
    Aero.el('detail-device').textContent = report.deviceRoom + ' (' + report.deviceId + ')';
    Aero.el('detail-type').innerHTML = typeBadge(report.type);
    Aero.el('detail-status').innerHTML = statusBadge(report.deviceStatusAtReport);
    Aero.el('detail-date').textContent = dateLabel(report.createdAt);
    Aero.el('detail-time').textContent = timeLabel(report.createdAt);
    Aero.el('detail-note').textContent = report.note || '\u2014';

    modalBackdrop.hidden = false;
    detailModal.hidden = false;
    requestAnimationFrame(function () {
      modalBackdrop.classList.add('is-open');
      detailModal.classList.add('is-open');
    });
    detailClose.focus();
    document.body.style.overflow = 'hidden';
  }

  function closeDetailModal() {
    modalBackdrop.classList.remove('is-open');
    detailModal.classList.remove('is-open');
    setTimeout(function () {
      modalBackdrop.hidden = true;
      detailModal.hidden = true;
    }, 250);
    document.body.style.overflow = '';
  }

  modalBackdrop.addEventListener('click', function (e) {
    if (e.target === modalBackdrop) closeDetailModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !detailModal.hidden) closeDetailModal();
  });

  detailClose.addEventListener('click', closeDetailModal);

  reportsBody.addEventListener('click', function (e) {
    var row = e.target.closest('tr[data-id]');
    if (row) {
      var id = row.getAttribute('data-id');
      var report = filteredReports.find(function (r) { return r.id === id; });
      if (report) openDetailModal(report);
    }
  });

  pagination.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-page]');
    if (btn) {
      currentPage = parseInt(btn.getAttribute('data-page'), 10);
      renderTable();
      renderPagination();
    }
  });

  searchInput.addEventListener('input', function () {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(function () {
      searchQuery = searchInput.value.trim();
      applyFilters();
      renderStats();
      renderTable();
      renderPagination();
    }, 150);
  });

  typeSelect.addEventListener('change', function () {
    typeFilter = typeSelect.value;
    applyFilters();
    renderStats();
    renderTable();
    renderPagination();
  });

  dateFromInput.addEventListener('change', function () {
    dateFrom = parseDateInput(dateFromInput.value);
    applyFilters();
    renderStats();
    renderTable();
    renderPagination();
  });

  dateToInput.addEventListener('change', function () {
    dateTo = parseDateInput(dateToInput.value);
    applyFilters();
    renderStats();
    renderTable();
    renderPagination();
  });

  clearDateBtn.addEventListener('click', function () {
    dateFromInput.value = '';
    dateToInput.value = '';
    dateFrom = null;
    dateTo = null;
    applyFilters();
    renderStats();
    renderTable();
    renderPagination();
  });

  loadReports();
});