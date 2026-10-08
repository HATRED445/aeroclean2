Aero.onReady(function () {
  'use strict';

  var user = Aero.require(['personnel', 'admin']);
  if (!user) return;

  var esc = Aero.esc;
  var alertsBody = Aero.el('alerts-body');
  var alertsWrap = Aero.el('alerts-wrap');
  var alertsEmpty = Aero.el('alerts-empty');
  var liveCount = Aero.el('live-count');

  // Filter state
  var searchQuery = '';
  var eventTypeFilter = '';
  var dateFrom = null;
  var dateTo = null;
  var minDuration = 8000;
  var maxDuration = 3600000;
  var searchDebounce = null;

  // Filter DOM elements
  var searchInput = Aero.el('alert-search');
  var eventTypeSelect = Aero.el('filter-event-type');
  var dateFromInput = Aero.el('filter-alert-date-from');
  var dateToInput = Aero.el('filter-alert-date-to');
  var clearDateBtn = Aero.el('clear-alert-date-filter');
  var minDurationInput = Aero.el('filter-min-duration');
  var maxDurationInput = Aero.el('filter-max-duration');

  function fmtTime(iso) {
    var d = new Date(iso);
    return d.toLocaleString();
  }

  function fmtDuration(ms) {
    var s = Math.round(ms / 1000);
    return s + 's';
  }

  function parseDateInput(value) {
    if (!value) return null;
    var parts = value.split('-');
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }

  function applyFilters(allAlerts) {
    return allAlerts.filter(function (a) {
      if (searchQuery) {
        var q = searchQuery.toLowerCase();
        var haystack = (a.room + ' ' + a.nodeId).toLowerCase();
        if (haystack.indexOf(q) === -1) return false;
      }
      if (eventTypeFilter && a.eventType !== eventTypeFilter) return false;
      if (dateFrom) {
        var d = new Date(a.startTime);
        if (d < dateFrom) return false;
      }
      if (dateTo) {
        var d = new Date(a.startTime);
        var endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        if (d > endOfDay) return false;
      }
      if (minDuration && a.durationMs < minDuration) return false;
      if (maxDuration && a.durationMs > maxDuration) return false;
      return true;
    });
  }

  function render(snapshot) {
    var allAlerts = [];
    for (var i = 0; i < snapshot.devices.length; i++) {
      var device = snapshot.devices[i];
      if (device.alertHistory && device.alertHistory.length) {
        for (var j = 0; j < device.alertHistory.length; j++) {
          var a = device.alertHistory[j];
          allAlerts.push({
            room: device.room,
            nodeId: device.nodeId,
            startTime: a.startTime,
            durationMs: a.durationMs,
            peakPpm: a.peakPpm,
            eventType: a.eventType
          });
        }
      }
    }

    var filteredAlerts = applyFilters(allAlerts);

    filteredAlerts.sort(function (a, b) {
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    });

    if (filteredAlerts.length === 0) {
      alertsBody.innerHTML = '';
      alertsWrap.hidden = true;
      alertsEmpty.hidden = false;
      liveCount.textContent = '0 alerts';
      return;
    }

    alertsWrap.hidden = false;
    alertsEmpty.hidden = true;
    liveCount.textContent = filteredAlerts.length + ' alert' + (filteredAlerts.length !== 1 ? 's' : '');

    alertsBody.innerHTML = filteredAlerts.map(function (a) {
      var badgeClass = a.eventType === 'gradual' ? 'badge-gradual' : 'badge-spike';
      var badgeLabel = a.eventType === 'gradual' ? 'Gradual' : 'Sudden';
      return (
        '<tr>' +
        '<td>' + esc(a.room) + '</td>' +
        '<td>' + esc(a.nodeId) + '</td>' +
        '<td>' + fmtTime(a.startTime) + '</td>' +
        '<td>' + fmtDuration(a.durationMs) + '</td>' +
        '<td>' + a.peakPpm.toFixed(1) + ' ppm</td>' +
        '<td><span class="badge ' + badgeClass + '">' + esc(badgeLabel) + '</span></td>' +
        '</tr>'
      );
    }).join('');
  }

  // Filter event listeners
  searchInput.addEventListener('input', function () {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(function () {
      searchQuery = searchInput.value.trim();
      render(Telemetry.snapshot());
    }, 150);
  });

  eventTypeSelect.addEventListener('change', function () {
    eventTypeFilter = eventTypeSelect.value;
    render(Telemetry.snapshot());
  });

  dateFromInput.addEventListener('change', function () {
    dateFrom = parseDateInput(dateFromInput.value);
    render(Telemetry.snapshot());
  });

  dateToInput.addEventListener('change', function () {
    dateTo = parseDateInput(dateToInput.value);
    render(Telemetry.snapshot());
  });

  clearDateBtn.addEventListener('click', function () {
    dateFromInput.value = '';
    dateToInput.value = '';
    dateFrom = null;
    dateTo = null;
    render(Telemetry.snapshot());
  });

  minDurationInput.addEventListener('change', function () {
    minDuration = minDurationInput.value ? parseInt(minDurationInput.value, 10) * 1000 : 8000;
    render(Telemetry.snapshot());
  });

  maxDurationInput.addEventListener('change', function () {
    maxDuration = maxDurationInput.value ? parseInt(maxDurationInput.value, 10) * 1000 : 3600000;
    render(Telemetry.snapshot());
  });

  render(Telemetry.snapshot());
  Telemetry.subscribe(render);
});