Aero.onReady(function () {
  'use strict';

  var user = Aero.require(['admin', 'personnel']);
  if (!user) return;

  var isAdmin = user.role === 'admin';
  var esc = Aero.esc;
  var fmtDate = Aero.fmtDate;
  var formatTime12h = Aero.formatTime12h;
  var getEventStatus = Aero.getEventStatus;
  var statusBadge = Aero.statusBadge;
  var recurrenceBadge = Aero.recurrenceBadge;
  var RECURRENCE_TYPES = Aero.RECURRENCE_TYPES;
  var rooms = Telemetry ? Telemetry.ROOMS : [];

  var PAGE_SIZE = 25;
  var currentPage = 1;
  var filteredOccurrences = [];
  var editScheduleId = null;
  var conflictDebounce = null;

  var createScheduleBtn = Aero.el('create-schedule-btn');
  var adminActions = Aero.el('admin-actions');
  var schedulesBody = Aero.el('schedules-body');
  var schedulesEmpty = Aero.el('schedules-empty');
  var schedulesWrap = Aero.el('schedules-wrap');
  var pagination = Aero.el('pagination');
  var actionsTh = Aero.el('actions-th');
  var personnelTh = Aero.el('personnel-th');
  var filterSearch = Aero.el('filter-search');
  var filterRoom = Aero.el('filter-room');
  var filterRecurrence = Aero.el('filter-recurrence');
  var filterDateFrom = Aero.el('filter-date-from');
  var filterDateTo = Aero.el('filter-date-to');
  var quickFilters = Aero.el('quick-filters');
  var printBtn = Aero.el('print-btn');
  var modalBackdrop = Aero.el('schedule-modal-backdrop');
  var scheduleModal = Aero.el('schedule-modal');
  var modalClose = Aero.el('schedule-modal-close');
  var modalTitle = Aero.el('schedule-modal-title');
  var scheduleForm = Aero.el('schedule-form');
  var scheduleRoom = Aero.el('schedule-room');
  var scheduleDate = Aero.el('schedule-date');
  var scheduleStart = Aero.el('schedule-start');
  var scheduleEnd = Aero.el('schedule-end');
  var scheduleTitle = Aero.el('schedule-title');
  var scheduleDesc = Aero.el('schedule-desc');
  var descCharCount = Aero.el('desc-char-count');
  var recurrenceRadios = scheduleForm.querySelectorAll('input[name="recurrence"]');
  var recurrenceEndField = Aero.el('recurrence-end-field');
  var scheduleRecurrenceEnd = Aero.el('schedule-recurrence-end');
  var conflictWarning = Aero.el('conflict-warning');
  var scheduleCancel = Aero.el('schedule-cancel');
  var schedulePersonnel = Aero.el('schedule-personnel');
  var schedulePersonnelField = Aero.el('schedule-personnel-field');

  if (isAdmin) {
    adminActions.hidden = false;
    actionsTh.hidden = false;
    personnelTh.hidden = false;
    schedulePersonnelField.hidden = false;
  }

  function populateRoomSelects() {
    var options = rooms.map(function (room) {
      return '<option value="' + esc(room.nodeId) + '">' + esc(room.room) + ' (' + esc(room.nodeId) + ')</option>';
    }).join('');
    scheduleRoom.innerHTML = '<option value="">Select a room</option>' + options;
    filterRoom.innerHTML = '<option value="all">All Rooms</option>' + options;
  }

  function populatePersonnelSelect() {
    var users = Aero.allUsers();
    var personnel = users.filter(function (u) { return u.role === 'personnel' && u.status === 'active'; });
    var options = personnel.map(function (p) {
      return '<option value="' + esc(p.id) + '">' + esc(p.fullName) + ' (' + esc(p.schoolId) + ')</option>';
    }).join('');
    schedulePersonnel.innerHTML = '<option value="">Unassigned</option>' + options;
  }

  function getDefaultDate() {
    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  }

  function getDefaultRange() {
    var today = new Date();
    var monthLater = new Date();
    monthLater.setDate(today.getDate() + 30);
    return {
      from: today.toISOString().slice(0, 10),
      to: monthLater.toISOString().slice(0, 10)
    };
  }

  function setDateRange(from, to) {
    filterDateFrom.value = from;
    filterDateTo.value = to;
  }

  function clearDateRange() {
    filterDateFrom.value = '';
    filterDateTo.value = '';
  }

  function updateDescCharCount() {
    var len = scheduleDesc.value.length;
    descCharCount.textContent = len + '/500 characters';
    descCharCount.classList.remove('near-limit', 'over-limit');
    if (len >= 500) descCharCount.classList.add('over-limit');
    else if (len >= 450) descCharCount.classList.add('near-limit');
  }

  function updateRecurrenceEndVisibility() {
    var recurrence = scheduleForm.querySelector('input[name="recurrence"]:checked').value;
    recurrenceEndField.hidden = recurrence === RECURRENCE_TYPES.NONE;
    if (recurrence === RECURRENCE_TYPES.NONE) {
      scheduleRecurrenceEnd.value = '';
    }
  }

  function checkConflictsAndWarn() {
    clearTimeout(conflictDebounce);
    conflictDebounce = setTimeout(function () {
      var roomId = scheduleRoom.value;
      var date = scheduleDate.value;
      var start = scheduleStart.value;
      var end = scheduleEnd.value;
      var recurrence = scheduleForm.querySelector('input[name="recurrence"]:checked').value;
      var recurrenceEnd = scheduleRecurrenceEnd.value || null;
      var personnelId = schedulePersonnel.value || null;

      if (!roomId || !date || !start || !end) {
        conflictWarning.hidden = true;
        conflictWarning.textContent = '';
        return;
      }

      var excludeId = editScheduleId;
      var result = Aero.checkConflicts(roomId, date, start, end, recurrence, recurrenceEnd, excludeId, personnelId);
      if (result.conflict) {
        conflictWarning.hidden = false;
        var conflictType = result.type === 'personnel' ? 'Personnel conflict: ' : 'Room conflict: ';
        conflictWarning.textContent = conflictType + '"' + esc(result.existing.title) + '" on ' + fmtDate(result.occurrence.date) + ' at ' + formatTime12h(result.occurrence.startTime) + ' - ' + formatTime12h(result.occurrence.endTime);
      } else {
        conflictWarning.hidden = true;
        conflictWarning.textContent = '';
      }
    }, 300);
  }

  function loadSchedules() {
    var from = filterDateFrom.value || getDefaultRange().from;
    var to = filterDateTo.value || getDefaultRange().to;
    var roomId = filterRoom.value;
    var recurrence = filterRecurrence.value;
    var search = filterSearch.value.trim().toLowerCase();

    var occurrences = Aero.getAllOccurrencesInRange(from, to);

    if (roomId !== 'all') {
      occurrences = occurrences.filter(function (o) { return o.roomId === roomId; });
    }
    if (recurrence !== 'all') {
      occurrences = occurrences.filter(function (o) { return o.recurrence === recurrence; });
    }
    if (search) {
      occurrences = occurrences.filter(function (o) {
        return o.title.toLowerCase().includes(search) ||
               o.roomName.toLowerCase().includes(search) ||
               (o.description && o.description.toLowerCase().includes(search));
      });
    }

    if (!isAdmin) {
      var currentUser = Aero.currentUser();
      if (currentUser) {
        occurrences = occurrences.filter(function (occ) {
          return occ.personnelId === currentUser.id;
        });
      }
    }

    filteredOccurrences = occurrences;
    currentPage = 1;
    renderTable();
    renderPagination();
  }

  function renderTable() {
    var displayOccurrences = filteredOccurrences;

    var start = (currentPage - 1) * PAGE_SIZE;
    var pageOccurrences = displayOccurrences.slice(start, start + PAGE_SIZE);

    if (pageOccurrences.length === 0) {
      schedulesBody.innerHTML = '';
      schedulesWrap.hidden = true;
      schedulesEmpty.hidden = false;
      pagination.innerHTML = '';
      return;
    }

    schedulesWrap.hidden = false;
    schedulesEmpty.hidden = true;

    schedulesBody.innerHTML = pageOccurrences.map(function (occ) {
      var actionsHtml = '';
      var personnelHtml = isAdmin ? '<td>' + esc(occ.personnelName || 'Unassigned') + '</td>' : '';
      if (isAdmin) {
        actionsHtml =
          '<button type="button" class="btn btn-sm btn-light" data-action="edit" data-base-id="' + esc(occ.baseId) + '" aria-label="Edit schedule">' +
          '<span>Edit</span></button> ' +
          '<button type="button" class="btn btn-sm btn-danger" data-action="delete" data-base-id="' + esc(occ.baseId) + '" aria-label="Delete schedule">' +
          '<span>Delete</span></button>';
      }
      return (
        '<tr data-base-id="' + esc(occ.baseId) + '">' +
        '<td>' + esc(occ.roomName) + '</td>' +
        '<td>' + fmtDate(occ.date) + '</td>' +
        '<td>' + formatTime12h(occ.startTime) + ' \u2013 ' + formatTime12h(occ.endTime) + '</td>' +
        '<td>' + esc(occ.title) + (occ.description ? '<br><span class="muted">' + esc(occ.description.slice(0, 60)) + (occ.description.length > 60 ? '\u2026' : '') + '</span>' : '') + '</td>' +
        '<td>' + recurrenceBadge(occ.recurrence) + '</td>' +
        '<td>' + statusBadge(occ.status) + '</td>' +
        personnelHtml +
        '<td class="cell-actions">' + actionsHtml + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function renderPagination() {
    var totalPages = Math.ceil(filteredOccurrences.length / PAGE_SIZE);
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

  function openCreateModal() {
    editScheduleId = null;
    modalTitle.textContent = 'Create Schedule';
    scheduleForm.reset();
    scheduleDate.value = getDefaultDate();
    scheduleStart.value = '09:00';
    scheduleEnd.value = '10:00';
    schedulePersonnel.value = '';
    updateDescCharCount();
    updateRecurrenceEndVisibility();
    conflictWarning.hidden = true;
    conflictWarning.textContent = '';
    modalBackdrop.hidden = false;
    scheduleModal.hidden = false;
    requestAnimationFrame(function () {
      modalBackdrop.classList.add('is-open');
      scheduleModal.classList.add('is-open');
    });
    scheduleRoom.focus();
    document.body.style.overflow = 'hidden';
  }

  function openEditModal(baseId) {
    var schedules = Aero.readSchedules();
    var schedule = null;
    for (var i = 0; i < schedules.length; i++) {
      if (schedules[i].id === baseId) {
        schedule = schedules[i];
        break;
      }
    }
    if (!schedule) return;

    editScheduleId = baseId;
    modalTitle.textContent = 'Edit Schedule';
    scheduleRoom.value = schedule.roomId;
    scheduleDate.value = schedule.date;
    scheduleStart.value = schedule.startTime;
    scheduleEnd.value = schedule.endTime;
    scheduleTitle.value = schedule.title;
    scheduleDesc.value = schedule.description || '';
    updateDescCharCount();
    var recurrenceRadio = scheduleForm.querySelector('input[name="recurrence"][value="' + schedule.recurrence + '"]');
    if (recurrenceRadio) recurrenceRadio.checked = true;
    updateRecurrenceEndVisibility();
    scheduleRecurrenceEnd.value = schedule.recurrenceEnd || '';
    schedulePersonnel.value = schedule.personnelId || '';
    conflictWarning.hidden = true;
    conflictWarning.textContent = '';
    modalBackdrop.hidden = false;
    scheduleModal.hidden = false;
    requestAnimationFrame(function () {
      modalBackdrop.classList.add('is-open');
      scheduleModal.classList.add('is-open');
    });
    scheduleRoom.focus();
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modalBackdrop.classList.remove('is-open');
    scheduleModal.classList.remove('is-open');
    setTimeout(function () {
      modalBackdrop.hidden = true;
      scheduleModal.hidden = true;
    }, 250);
    document.body.style.overflow = '';
    editScheduleId = null;
  }

  function handleSubmit(e) {
    e.preventDefault();
    var roomId = scheduleRoom.value;
    var date = scheduleDate.value;
    var start = scheduleStart.value;
    var end = scheduleEnd.value;
    var title = scheduleTitle.value.trim();
    var desc = scheduleDesc.value.trim();
    var recurrence = scheduleForm.querySelector('input[name="recurrence"]:checked').value;
    var recurrenceEnd = scheduleRecurrenceEnd.value || null;
    var personnelId = schedulePersonnel.value || null;

    if (!roomId) { scheduleRoom.focus(); scheduleRoom.classList.add('has-error'); return; }
    if (!date) { scheduleDate.focus(); scheduleDate.classList.add('has-error'); return; }
    if (!start) { scheduleStart.focus(); scheduleStart.classList.add('has-error'); return; }
    if (!end) { scheduleEnd.focus(); scheduleEnd.classList.add('has-error'); return; }
    if (!title) { scheduleTitle.focus(); scheduleTitle.classList.add('has-error'); return; }

    var data = {
      roomId: roomId,
      date: date,
      startTime: start,
      endTime: end,
      title: title,
      description: desc,
      recurrence: recurrence,
      recurrenceEnd: recurrenceEnd,
      personnelId: personnelId
    };

    var result;
    if (editScheduleId) {
      result = Aero.updateSchedule(editScheduleId, data);
    } else {
      result = Aero.createSchedule(data);
    }

    if (result.ok) {
      Aero.toast(editScheduleId ? 'Schedule updated' : 'Schedule created', 'success');
      closeModal();
      loadSchedules();
    } else {
      if (result.errors) {
        Aero.showErrors(scheduleForm, result.errors);
      }
      Aero.toast(result.message, 'error');
    }
  }

  function handleDelete(baseId) {
    if (!confirm('Delete this schedule and all future occurrences?')) return;
    var result = Aero.deleteSchedule(baseId);
    if (result.ok) {
      Aero.toast('Schedule deleted', 'success');
      loadSchedules();
    } else {
      Aero.toast(result.message, 'error');
    }
  }

  function printSchedule() {
    var from = filterDateFrom.value || getDefaultRange().from;
    var to = filterDateTo.value || getDefaultRange().to;
    var roomId = filterRoom.value;
    var recurrence = filterRecurrence.value;
    var search = filterSearch.value.trim().toLowerCase();

    var occurrences = Aero.getAllOccurrencesInRange(from, to);
    if (roomId !== 'all') occurrences = occurrences.filter(function (o) { return o.roomId === roomId; });
    if (recurrence !== 'all') occurrences = occurrences.filter(function (o) { return o.recurrence === recurrence; });
    if (search) occurrences = occurrences.filter(function (o) {
      return o.title.toLowerCase().includes(search) ||
             o.roomName.toLowerCase().includes(search) ||
             (o.description && o.description.toLowerCase().includes(search));
    });

    var printWindow = window.open('', '_blank');
    var rows = occurrences.map(function (occ) {
      var personnelCell = isAdmin ? '<td>' + esc(occ.personnelName || 'Unassigned') + '</td>' : '';
      return '<tr>' +
        '<td>' + esc(occ.roomName) + '</td>' +
        '<td>' + fmtDate(occ.date) + '</td>' +
        '<td>' + formatTime12h(occ.startTime) + ' \u2013 ' + formatTime12h(occ.endTime) + '</td>' +
        '<td>' + esc(occ.title) + (occ.description ? '<br><span style="font-size:12px; color:#666;">' + esc(occ.description) + '</span>' : '') + '</td>' +
        '<td>' + Aero.RECURRENCE_LABELS[occ.recurrence] + '</td>' +
        '<td>' + occ.status + '</td>' +
        personnelCell +
        '</tr>';
    }).join('');

    var headerCols = '<th>Room</th><th>Date</th><th>Time</th><th>Title</th><th>Recurrence</th><th>Status</th>';
    var colspan = 6;
    if (isAdmin) {
      headerCols += '<th>Personnel</th>';
      colspan = 7;
    }

    printWindow.document.write(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Schedules - AeroClean</title>' +
      '<style>' +
      'body{font-family:Segoe UI,sans-serif;padding:20px;color:#333}' +
      'h1{margin-bottom:4px} .subtitle{color:#666;margin-bottom:20px}' +
      'table{width:100%;border-collapse:collapse;font-size:13px}' +
      'th,td{border:1px solid #ccc;padding:8px;text-align:left;vertical-align:top}' +
      'th{background:#f5f5f5;font-weight:700}' +
      'tr:nth-child(even){background:#fafafa}' +
      '@media print{body{padding:0}}' +
      '</style></head><body>' +
      '<h1>Schedules</h1>' +
      '<p class="subtitle">AeroClean \u00b7 ' + fmtDate(new Date().toISOString()) + ' \u00b7 ' + (from === getDefaultRange().from && to === getDefaultRange().to ? 'Next 30 Days' : from + ' to ' + to) + '</p>' +
      '<table><thead><tr>' + headerCols + '</tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="' + colspan + '" style="text-align:center;color:#999">No schedules</td></tr>') + '</tbody></table>' +
      '</body></html>'
    );
    printWindow.document.close();
    printWindow.focus();
    setTimeout(function () { printWindow.print(); }, 250);
  }

  createScheduleBtn.addEventListener('click', openCreateModal);
  modalClose.addEventListener('click', closeModal);
  scheduleCancel.addEventListener('click', closeModal);
  scheduleForm.addEventListener('submit', handleSubmit);
  scheduleDesc.addEventListener('input', updateDescCharCount);
  recurrenceRadios.forEach(function (r) { r.addEventListener('change', updateRecurrenceEndVisibility); });

  scheduleRoom.addEventListener('change', function () { this.classList.remove('has-error'); checkConflictsAndWarn(); });
  scheduleDate.addEventListener('change', function () { this.classList.remove('has-error'); checkConflictsAndWarn(); });
  scheduleStart.addEventListener('change', function () { this.classList.remove('has-error'); checkConflictsAndWarn(); });
  scheduleEnd.addEventListener('change', function () { this.classList.remove('has-error'); checkConflictsAndWarn(); });
  scheduleTitle.addEventListener('input', function () { this.classList.remove('has-error'); });
  scheduleRecurrenceEnd.addEventListener('change', checkConflictsAndWarn);
  schedulePersonnel.addEventListener('change', checkConflictsAndWarn);

  modalBackdrop.addEventListener('click', function (e) {
    if (e.target === modalBackdrop) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !scheduleModal.hidden) closeModal();
  });

  filterSearch.addEventListener('input', function () {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(loadSchedules, 300);
  });
  filterSearch.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { clearTimeout(searchDebounce); loadSchedules(); }
  });
  filterRoom.addEventListener('change', loadSchedules);
  filterRecurrence.addEventListener('change', loadSchedules);
  filterDateFrom.addEventListener('change', loadSchedules);
  filterDateTo.addEventListener('change', loadSchedules);

  var searchDebounce;
  quickFilters.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-preset]');
    if (!btn) return;
    var preset = btn.getAttribute('data-preset');
    var today = new Date();
    if (preset === 'week') {
      var weekLater = new Date(); weekLater.setDate(today.getDate() + 7);
      setDateRange(today.toISOString().slice(0, 10), weekLater.toISOString().slice(0, 10));
    } else if (preset === 'month') {
      var monthLater = new Date(); monthLater.setDate(today.getDate() + 30);
      setDateRange(today.toISOString().slice(0, 10), monthLater.toISOString().slice(0, 10));
    } else {
      clearDateRange();
    }
    quickFilters.querySelectorAll('button').forEach(function (b) { b.classList.remove('btn-primary'); b.classList.add('btn-ghost'); });
    btn.classList.remove('btn-ghost');
    btn.classList.add('btn-primary');
    loadSchedules();
  });

  printBtn.addEventListener('click', printSchedule);

  schedulesBody.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    var baseId = btn.getAttribute('data-base-id');
    if (action === 'edit') openEditModal(baseId);
    else if (action === 'delete') handleDelete(baseId);
  });

  pagination.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-page]');
    if (btn) {
      currentPage = parseInt(btn.getAttribute('data-page'), 10);
      renderTable();
      renderPagination();
    }
  });

  populateRoomSelects();
  populatePersonnelSelect();
  setDateRange(getDefaultRange().from, getDefaultRange().to);
  loadSchedules();
});