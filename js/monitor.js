Aero.onReady(function () {
  'use strict';

  var user = Aero.require(['student', 'personnel', 'admin']);
  if (!user) return;

  var CIRC = 2 * Math.PI * 52;
  var MODAL_CIRC = 2 * Math.PI * 70;
  var grid = Aero.el('device-grid');
  var thresholds = Telemetry.THRESHOLDS;
  var rooms = Telemetry.ROOMS;

  var modalBackdrop = Aero.el('modal-backdrop');
  var modal = Aero.el('device-modal');
  var modalClose = Aero.el('modal-close');
  var currentDeviceIndex = -1;
  var currentDeviceId = null;
  var modalUnsubscribe = null;

  var isPersonnel = user.role === 'personnel';
  var reportTypeButtons = Aero.el('device-report-types');
  var createModal = Aero.el('create-report-modal');
  var createModalClose = Aero.el('create-report-close');
  var createModalCancel = Aero.el('create-report-cancel');
  var createReportForm = Aero.el('create-report-form');
  var noteTextarea = Aero.el('report-note');
  var charCount = Aero.el('note-char-count');
  var selectedType = null;

  if (isPersonnel && reportTypeButtons) reportTypeButtons.hidden = false;

  function esc(value) {
    return Aero.esc(value);
  }

  function timeLabel(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '\u2014';
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function getGaugeColor(device) {
    var status = device.status;
    if (status === 'alert') return '#dc2626';
    if (status === 'clean') return '#fff';
    return '#22c55e';
  }

  function getStatusClass(status) {
    if (status === 'alert') return 'is-alert';
    if (status === 'clean') return 'is-clean';
    return '';
  }

  function getStatusBadgeClass(status, device) {
    if (device && device.eventType === 'spike' && device.mq137 >= 20) return 'badge-odor';
    if (status === 'alert') return 'badge-alert';
    if (status === 'clean') return 'badge-clean';
    return 'badge-normal';
  }

  function getStatusLabel(status, device) {
    if (device && device.eventType === 'spike' && device.mq137 >= 20) return 'Odor';
    if (status === 'alert') return 'Odor Alert';
    if (status === 'clean') return 'Clean';
    return 'Normal';
  }

  function getDotClass(device, sensor) {
    if (sensor === 'mq137') return 'dot' + (device.mq137 > thresholds.mq137 ? ' is-hot' : '');
    if (sensor === 'mq3') return 'dot' + (device.mq3 > thresholds.mq3 ? ' is-hot' : '');
    return 'dot';
  }

  function getEventBadge(eventType) {
    if (eventType === 'gradual') return '<span class="badge badge-gradual">Gradual</span>';
    if (eventType === 'spike') return '<span class="badge badge-spike">Sudden</span>';
    return '';
  }

  function updateModalContent(device) {
    var idx = Math.max(0, Math.round(device.odorIndex));
    var status = device.status;

    var statusEl = Aero.el('modal-status');
    statusEl.className = 'badge ' + getStatusBadgeClass(status, device);
    statusEl.textContent = getStatusLabel(status, device);

    var eventBadgeEl = Aero.el('modal-event-badge');
    if (eventBadgeEl) eventBadgeEl.innerHTML = getEventBadge(device.eventType);

    var gaugeEl = Aero.el('modal-gauge');
    gaugeEl.classList.toggle('is-hot', status === 'alert');
    gaugeEl.classList.toggle('is-clean', status === 'clean');

    Aero.el('modal-gauge-num').textContent = idx;
    var ratio = Math.min(100, idx) / 100;
    Aero.el('modal-gauge-arc').setAttribute('stroke-dasharray', (MODAL_CIRC * ratio).toFixed(1) + ' ' + MODAL_CIRC.toFixed(1));
    Aero.el('modal-gauge-arc').style.stroke = getGaugeColor(device);

    var m137Hot = device.mq137 > thresholds.mq137;
    var m3Hot = device.mq3 > thresholds.mq3;

    Aero.el('modal-mq137').textContent = device.mq137 + ' / ' + thresholds.mq137 + ' ppm';
    Aero.el('modal-dot137').className = getDotClass(device, 'mq137');

    Aero.el('modal-mq3').textContent = device.mq3 + ' / ' + thresholds.mq3 + ' ppm';
    Aero.el('modal-dot3').className = getDotClass(device, 'mq3');

    Aero.el('modal-seen').textContent = 'Updated ' + timeLabel(device.updatedAt);
  }

  function openModal(index) {
    var snapshot = Telemetry.snapshot();
    var device = snapshot.devices[index];
    if (!device) return;

    currentDeviceIndex = index;
    currentDeviceId = device.nodeId || (rooms[index] && rooms[index].nodeId) || null;
    var room = rooms[index];

    Aero.el('modal-room').textContent = esc(device.room);
    Aero.el('modal-meta').textContent = esc(device.nodeId) + ' \u00B7 ' + esc(device.type);

    var statusEl = Aero.el('modal-status');
    statusEl.className = 'badge ' + getStatusBadgeClass(device.status, device);
    statusEl.textContent = getStatusLabel(device.status, device);

    var gaugeEl = Aero.el('modal-gauge');
    gaugeEl.classList.toggle('is-hot', device.status === 'alert');
    gaugeEl.classList.toggle('is-clean', device.status === 'clean');

    var idx = Math.max(0, Math.round(device.odorIndex));
    Aero.el('modal-gauge-num').textContent = idx;
    var ratio = Math.min(100, idx) / 100;
    Aero.el('modal-gauge-arc').setAttribute('stroke-dasharray', (MODAL_CIRC * ratio).toFixed(1) + ' ' + MODAL_CIRC.toFixed(1));
    Aero.el('modal-gauge-arc').style.stroke = getGaugeColor(device);

    var m137Hot = device.mq137 > thresholds.mq137;
    var m3Hot = device.mq3 > thresholds.mq3;

    Aero.el('modal-mq137').textContent = device.mq137 + ' / ' + thresholds.mq137 + ' ppm';
    Aero.el('modal-dot137').className = getDotClass(device, 'mq137');

    Aero.el('modal-mq3').textContent = device.mq3 + ' / ' + thresholds.mq3 + ' ppm';
    Aero.el('modal-dot3').className = getDotClass(device, 'mq3');

    var desc = 'Readings from ' + esc(device.room) + ' (' + esc(device.nodeId) + ', ' + esc(device.type) + '). ' +
      'MQ137 detects ammonia (NH\u2083); MQ3 detects alcohol vapors. ' +
      'Values shown in ppm against alert thresholds (MQ137: ' + thresholds.mq137 + ' ppm, MQ3: ' + thresholds.mq3 + ' ppm).';
    Aero.el('modal-readings-desc').textContent = desc;

    Aero.el('modal-type').textContent = esc(device.type);
    Aero.el('modal-seen').textContent = 'Updated ' + timeLabel(device.updatedAt);

    var eventBadgeEl = Aero.el('modal-event-badge');
    if (eventBadgeEl) eventBadgeEl.innerHTML = getEventBadge(device.eventType);

    modalBackdrop.hidden = false;
    modal.hidden = false;
    requestAnimationFrame(function () {
      modalBackdrop.classList.add('is-open');
      modal.classList.add('is-open');
    });
    modalClose.focus();
    document.body.style.overflow = 'hidden';

    modalUnsubscribe = Telemetry.subscribe(function (snapshot) {
      if (currentDeviceIndex !== index) return;
      var updatedDevice = snapshot.devices[index];
      if (updatedDevice) updateModalContent(updatedDevice);
    });
  }

  function closeModal() {
    if (modalUnsubscribe) {
      modalUnsubscribe();
      modalUnsubscribe = null;
    }
    modalBackdrop.classList.remove('is-open');
    modal.classList.remove('is-open');
    setTimeout(function () {
      modalBackdrop.hidden = true;
      modal.hidden = true;
      currentDeviceIndex = -1;
      currentDeviceId = null;
    }, 250);
    document.body.style.overflow = '';
  }

  function updateCharCount() {
    var len = noteTextarea.value.length;
    charCount.textContent = len + '/500 characters';
    charCount.classList.remove('near-limit', 'over-limit');
    if (len >= 500) charCount.classList.add('over-limit');
    else if (len >= 450) charCount.classList.add('near-limit');
  }

  function openCreateModal(type) {
    if (!createModal || !createReportForm || !currentDeviceId) return;
    selectedType = type;
    createReportForm.reset();
    var room = null;
    for (var i = 0; i < rooms.length; i++) {
      if (rooms[i].nodeId === currentDeviceId) { room = rooms[i]; break; }
    }
    Aero.el('report-device-label').textContent = room
      ? room.room + ' (' + room.nodeId + ')'
      : currentDeviceId;
    Aero.el('report-type-label').textContent = Aero.REPORT_TYPE_LABELS[type] || type;
    updateCharCount();
    createModal.hidden = false;
    requestAnimationFrame(function () {
      createModal.classList.add('is-open');
    });
    noteTextarea.focus();
    document.body.style.overflow = 'hidden';
  }

  function closeCreateModal() {
    if (!createModal) return;
    createModal.classList.remove('is-open');
    setTimeout(function () {
      createModal.hidden = true;
    }, 250);
    selectedType = null;
  }

  function handleCreateSubmit(e) {
    e.preventDefault();
    var deviceId = currentDeviceId;
    var type = selectedType;
    var note = noteTextarea.value.trim();

    if (!deviceId || !type) {
      Aero.toast('No device or report type selected', 'error');
      return;
    }

    var result = Aero.createReport(type, deviceId, note);
    if (result.ok) {
      Aero.toast('Report submitted', 'success');
      closeCreateModal();
    } else {
      Aero.toast(result.message, 'error');
    }
  }

  if (isPersonnel) {
    var typeBtns = reportTypeButtons.querySelectorAll('[data-report-type]');
    for (var t = 0; t < typeBtns.length; t++) {
      typeBtns[t].addEventListener('click', function (event) {
        openCreateModal(event.currentTarget.getAttribute('data-report-type'));
      });
    }
    createModalClose.addEventListener('click', closeCreateModal);
    createModalCancel.addEventListener('click', closeCreateModal);
    createReportForm.addEventListener('submit', handleCreateSubmit);
    noteTextarea.addEventListener('input', updateCharCount);
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      if (createModal && !createModal.hidden) { closeCreateModal(); return; }
      if (!modal.hidden) closeModal();
    }
  }

  function handleBackdropClick(e) {
    if (e.target === modalBackdrop) {
      if (createModal && !createModal.hidden) { closeCreateModal(); return; }
      closeModal();
    }
  }

  modalClose.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', handleBackdropClick);
  document.addEventListener('keydown', handleKeydown);

  function deviceCard(room, index) {
    return (
      '<article class="device-card" id="dev-' + index + '">' +
        '<div class="device-head">' +
          '<div>' +
            '<div class="device-room">' + esc(room.room) + '</div>' +
            '<div class="device-meta">' + esc(room.nodeId) + ' &middot; ' + esc(room.type) + '</div>' +
          '</div>' +
          '<span class="badge badge-normal" data-field="status">Normal</span>' +
        '</div>' +

        '<div class="gauge" data-field="gauge">' +
          '<svg viewBox="0 0 120 120" aria-hidden="true">' +
            '<circle class="gauge-track" cx="60" cy="60" r="52"></circle>' +
            '<circle class="gauge-value" cx="60" cy="60" r="52" ' +
              'stroke-dasharray="0 ' + CIRC.toFixed(1) + '" data-field="arc"></circle>' +
          '</svg>' +
          '<div class="gauge-center">' +
            '<div class="gauge-num" data-field="index">0</div>' +
            '<div class="gauge-unit">Odor Index %</div>' +
          '</div>' +
        '</div>' +

        '<div class="reading">' +
          '<span class="dot" data-field="dot137"></span>' +
          '<span class="reading-name">MQ137</span>' +
          '<span class="reading-vals" data-field="mq137">&mdash;</span>' +
        '</div>' +

        '<div class="reading">' +
          '<span class="dot" data-field="dot3"></span>' +
          '<span class="reading-name">MQ3</span>' +
          '<span class="reading-vals" data-field="mq3">&mdash;</span>' +
        '</div>' +

        '<div class="device-foot">' +
          '<span data-field="type">' + esc(room.type) + '</span>' +
          '<span data-field="event-badge" class="event-badge"></span>' +
          '<span data-field="seen">Updated &mdash;</span>' +
        '</div>' +
      '</article>'
    );
  }

  function spark(svg, values, total) {
    if (!svg) return;
    var n = values.length;
    if (n < 2) {
      svg.innerHTML = '';
      return;
    }
    var max = Math.max(1, total);
    var pts = [];
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 100;
      var y = 38 - (Math.min(values[i], max) / max) * 34;
      pts.push(x.toFixed(2) + ',' + y.toFixed(2));
    }
    var line = pts.join(' ');
    var area = 'M' + pts[0] + ' L' + pts.join(' L') + ' L100,40 L0,40 Z';
    svg.innerHTML =
      '<path class="spark-area" d="' + area + '"></path>' +
      '<polyline class="spark-line" points="' + line + '"></polyline>';
  }

  function setText(id, value) {
    var node = Aero.el(id);
    if (node) node.textContent = value;
  }

function updateCard(card, device) {
    var status = device.status;
    var idx = Math.max(0, Math.round(device.odorIndex));

    card.classList.toggle('is-alert', status === 'alert');
    card.classList.toggle('is-clean', status === 'clean');

    var statusEl = card.querySelector('[data-field="status"]');
    statusEl.className = 'badge ' + getStatusBadgeClass(status, device);
    statusEl.textContent = getStatusLabel(status, device);

    var gauge = card.querySelector('[data-field="gauge"]');
    gauge.classList.toggle('is-hot', status === 'alert');
    gauge.classList.toggle('is-clean', status === 'clean');

    card.querySelector('[data-field="index"]').textContent = idx;

    var ratio = Math.min(100, idx) / 100;
    card
      .querySelector('[data-field="arc"]')
      .setAttribute('stroke-dasharray', (CIRC * ratio).toFixed(1) + ' ' + CIRC.toFixed(1));
    card.querySelector('[data-field="arc"]').style.stroke = getGaugeColor(device);

    var m137Hot = device.mq137 > thresholds.mq137;
    var m3Hot = device.mq3 > thresholds.mq3;

    card.querySelector('[data-field="mq137"]').textContent =
      device.mq137 + ' / ' + thresholds.mq137 + ' ppm';
    card.querySelector('[data-field="dot137"]').className = getDotClass(device, 'mq137');

    card.querySelector('[data-field="mq3"]').textContent =
      device.mq3 + ' / ' + thresholds.mq3 + ' ppm';
    card.querySelector('[data-field="dot3"]').className = getDotClass(device, 'mq3');

    var eventBadgeEl = card.querySelector('[data-field="event-badge"]');
    if (eventBadgeEl) eventBadgeEl.innerHTML = getEventBadge(device.eventType);

    card.querySelector('[data-field="seen"]').textContent = 'Updated ' + timeLabel(device.updatedAt);
  }

  function render(snapshot) {
    setText('normal-count', snapshot.normal);
    setText('normal-sub', 'of ' + snapshot.total + ' rooms');
    setText('normal-time', 'Updated ' + timeLabel(snapshot.lastUpdate));

    setText('clean-count', snapshot.clean);
    setText('clean-sub', 'of ' + snapshot.total + ' rooms');
    setText('clean-time', 'Updated ' + timeLabel(snapshot.lastUpdate));

    setText('alert-count', snapshot.alert);
    setText('alert-sub', 'of ' + snapshot.total + ' rooms');
    setText('alert-time', 'Updated ' + timeLabel(snapshot.lastUpdate));
    setText('device-count', snapshot.total + ' online');
    setText(
      'legend-thresholds',
      'MQ137 ' + thresholds.mq137 + ' ppm · MQ3 ' + thresholds.mq3 + ' ppm'
    );

    var chips = Aero.el('alert-chips');
    if (chips) {
      chips.innerHTML = snapshot.alertRooms.length
        ? snapshot.alertRooms
            .map(function (room) {
              return '<span class="chip is-hot">' + esc(room) + '</span>';
            })
            .join('')
        : '<span class="chip">All rooms clear</span>';
    }

    var cleanChips = Aero.el('clean-chips');
    if (cleanChips) {
      cleanChips.innerHTML = snapshot.cleanRooms.length
        ? snapshot.cleanRooms
            .map(function (room) {
              return '<span class="chip" style="background:#e5e7eb;color:#374151">' + esc(room) + '</span>';
            })
            .join('')
        : '<span class="chip">No rooms in clean state</span>';
    }

    spark(Aero.el('spark-normal'), snapshot.history.normal, snapshot.total);
    spark(Aero.el('spark-clean'), snapshot.history.clean, snapshot.total);
    spark(Aero.el('spark-alert'), snapshot.history.alert, snapshot.total);

    var cards = grid.children;
    for (var i = 0; i < cards.length; i++) {
      if (snapshot.devices[i]) updateCard(cards[i], snapshot.devices[i]);
    }
  }

  function renderLive() {
    var snapshot = Telemetry.snapshot();
    var indicator = Aero.el('live-indicator');
    if (!indicator) return;
    indicator.classList.toggle('is-stale', snapshot.stale);
    setText(
      'live-text',
      snapshot.stale
        ? 'No data for ' + Math.round(snapshot.ageMs / 1000) + 's'
        : 'Live · updated ' + Math.max(0, Math.round(snapshot.ageMs / 1000)) + 's ago'
    );
  }

  grid.innerHTML = Telemetry.ROOMS.map(deviceCard).join('');

  grid.addEventListener('click', function (e) {
    var card = e.target.closest('.device-card');
    if (card) {
      var index = parseInt(card.id.replace('dev-', ''), 10);
      if (!isNaN(index)) openModal(index);
    }
  });

  Telemetry.start();
  render(Telemetry.snapshot());
  Telemetry.subscribe(render);
  renderLive();
  setInterval(renderLive, 1000);
});
