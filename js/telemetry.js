/*
 * AeroClean - telemetry
 *
 * Simulated readings from the connected ESP32 nodes (each node carries an
 * MQ137 NH3 sensor and an MQ3 alcohol sensor).
 *
 * This is the single place to change thresholds, rooms and the update rate.
 * To use a real ESP32 later, replace `simulate()` with a fetch to the device
 * endpoint and keep returning the same device shape.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'aeroclean.telemetry';
  var TICK_MS = 2000;
  var HISTORY = 30;
  var STALE_MS = 30000;

  var THRESHOLDS = {
    mq137: 35, /* ppm - NH3 */
    mq3: 25    /* ppm - alcohol */
  };

  var ROOMS = [
    { room: '2F Comfort Room A', nodeId: 'ESP32-A01', type: 'Comfort Room' },
    { room: '2F Comfort Room B', nodeId: 'ESP32-A02', type: 'Comfort Room' },
    { room: '3F Comfort Room A', nodeId: 'ESP32-A03', type: 'Comfort Room' },
    { room: '3F Comfort Room B', nodeId: 'ESP32-A04', type: 'Comfort Room' },
    { room: '4F Comfort Room A', nodeId: 'ESP32-A05', type: 'Comfort Room' },
    { room: '4F Comfort Room B', nodeId: 'ESP32-A06', type: 'Comfort Room' }
  ];

  /* typical resting levels per room */
  var BASELINE = [
    { mq137: 8, mq3: 4 },
    { mq137: 10, mq3: 5 },
    { mq137: 12, mq3: 6 },
    { mq137: 9, mq3: 4 },
    { mq137: 15, mq3: 7 },
    { mq137: 6, mq3: 3 }
  ];

  /* Room-type modifiers for event probabilities */
  var ROOM_MODIFIERS = {
    'Comfort Room': { gradual: 1.5, spike: 2.0 }
  };

  /* Simulation configuration per sensor */
  var SIM_CONFIG = {
    mq137: {
      gradual: { probPerTick: 0.008, buildTicksMin: 12, buildTicksMax: 25, sustainTicksMin: 8, sustainTicksMax: 18, decayTicksMin: 20, decayTicksMax: 35, buildRateMin: 0.4, buildRateMax: 1.2, sustainNoise: 2.5, decayRateMin: 0.2, decayRateMax: 0.6, maxAdd: 25 },
      spike:   { probPerTick: 0.03,  spikeAddMin: 15, spikeAddMax: 40, decayTicksMin: 4, decayTicksMax: 8, decayRateMin: 0.25, decayRateMax: 0.4 }
    },
    mq3: {
      gradual: { probPerTick: 0.005, buildTicksMin: 8, buildTicksMax: 18, sustainTicksMin: 6, sustainTicksMax: 14, decayTicksMin: 12, decayTicksMax: 22, buildRateMin: 0.3, buildRateMax: 1.0, sustainNoise: 2.0, decayRateMin: 0.25, decayRateMax: 0.5, maxAdd: 20 },
      spike:   { probPerTick: 0.025, spikeAddMin: 10, spikeAddMax: 30, decayTicksMin: 3, decayTicksMax: 6, decayRateMin: 0.3, decayRateMax: 0.5 }
    }
  };

  var state = null;
  var timer = null;
  var listeners = [];

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  function readStore() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeStore() {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      /* storage unavailable - keep running in memory */
    }
  }

  function classify(mq137, mq3) {
    var mq137High = mq137 > THRESHOLDS.mq137;
    var mq3High = mq3 > THRESHOLDS.mq3;
    if (mq137High) return 'alert';
    if (mq3High) return 'clean';
    return 'normal';
  }

  function odorIndex(mq137, mq3) {
    var ratio = Math.max(mq137 / THRESHOLDS.mq137, mq3 / THRESHOLDS.mq3);
    return Math.round(ratio * 100);
  }

  function getRoomModifier(roomType) {
    return ROOM_MODIFIERS[roomType] || { gradual: 1.0, spike: 1.0 };
  }

  function createSimState() {
    return {
      mq137: { mode: 'idle', timer: 0, phase: 'idle', eventType: null, targetPeak: 0 },
      mq3:   { mode: 'idle', timer: 0, phase: 'idle', eventType: null, targetPeak: 0 }
    };
  }

  function buildDevice(index) {
    var room = ROOMS[index];
    var base = BASELINE[index] || BASELINE[0];
    return {
      room: room.room,
      nodeId: room.nodeId,
      type: room.type,
      mq137: base.mq137,
      mq3: base.mq3,
      status: 'normal',
      odorIndex: 100,
      updatedAt: new Date().toISOString(),
      sim: createSimState(),
      alertHistory: [],
      alertTracking: {
        isInAlert: false,
        alertStartTime: null,
        currentEventType: null,
        peakPpm: 0
      }
    };
  }

  function freshState() {
    var devices = [];
    for (var i = 0; i < ROOMS.length; i++) devices.push(buildDevice(i));
    return {
      devices: devices,
      history: { normal: [], clean: [], alert: [] },
      lastUpdate: new Date().toISOString(),
      tick: 0
    };
  }

  function loadState() {
    var stored = readStore();
    if (
      !stored ||
      !Array.isArray(stored.devices) ||
      stored.devices.length !== ROOMS.length ||
      !stored.history ||
      !Array.isArray(stored.history.normal) ||
      !Array.isArray(stored.history.clean) ||
      !Array.isArray(stored.history.alert)
    ) {
      return freshState();
    }
    /* Ensure sim state exists on loaded devices (backward compat) */
    for (var i = 0; i < stored.devices.length; i++) {
      if (!stored.devices[i].sim) {
        stored.devices[i].sim = createSimState();
      }
      if (!stored.devices[i].alertHistory) {
        stored.devices[i].alertHistory = [];
      }
      if (!stored.devices[i].alertTracking) {
        stored.devices[i].alertTracking = {
          isInAlert: false,
          alertStartTime: null,
          currentEventType: null,
          peakPpm: 0
        };
      }
    }
    return stored;
  }

  function maybeStartEvent(sensorType, deviceIndex, base, sim) {
    var s = sim[sensorType];
    if (s.mode !== 'idle') return;

    var roomType = ROOMS[deviceIndex].type;
    var mod = getRoomModifier(roomType);
    var cfg = SIM_CONFIG[sensorType];
    var gradualProb = cfg.gradual.probPerTick * mod.gradual;
    var spikeProb = cfg.spike.probPerTick * mod.spike;

    var r = Math.random();
    if (r < gradualProb) {
      /* Start gradual event */
      var g = cfg.gradual;
      s.mode = 'gradual';
      s.phase = 'building';
      s.eventType = 'gradual';
      s.timer = Math.floor(g.buildTicksMin + Math.random() * (g.buildTicksMax - g.buildTicksMin));
      var maxAdd = g.maxAdd;
      s.targetPeak = clamp(base + maxAdd, base + 5, THRESHOLDS[sensorType] + 20);
    } else if (r < gradualProb + spikeProb) {
      /* Start spike event */
      var sp = cfg.spike;
      s.mode = 'spike';
      s.phase = 'spiking';
      s.eventType = 'spike';
      s.timer = 1;
      var spikeAdd = sp.spikeAddMin + Math.random() * (sp.spikeAddMax - sp.spikeAddMin);
      s.targetPeak = clamp(base + spikeAdd, base + 5, 90);
    }
  }

  function stepGradual(sensorType, current, base, sim) {
    var s = sim[sensorType];
    var g = SIM_CONFIG[sensorType].gradual;

    if (s.phase === 'building') {
      var buildRate = g.buildRateMin + Math.random() * (g.buildRateMax - g.buildRateMin);
      var step = buildRate + (Math.random() - 0.5) * 0.8;
      current = Math.min(current + step, s.targetPeak);
      s.timer--;
      if (s.timer <= 0) {
        s.phase = 'sustained';
        s.timer = Math.floor(g.sustainTicksMin + Math.random() * (g.sustainTicksMax - g.sustainTicksMin));
      }
    } else if (s.phase === 'sustained') {
      current = s.targetPeak + (Math.random() - 0.5) * g.sustainNoise;
      s.timer--;
      if (s.timer <= 0) {
        s.phase = 'decaying';
        s.timer = Math.floor(g.decayTicksMin + Math.random() * (g.decayTicksMax - g.decayTicksMin));
      }
    } else if (s.phase === 'decaying') {
      var decayRate = g.decayRateMin + Math.random() * (g.decayRateMax - g.decayRateMin);
      var step = decayRate + (Math.random() - 0.5) * 0.4;
      current = Math.max(current - step, base);
      s.timer--;
      if (s.timer <= 0 || current <= base + 0.5) {
        s.mode = 'idle';
        s.phase = 'idle';
        s.eventType = null;
        current = base;
      }
    }
    return clamp(round1(current), 1, 90);
  }

  function stepSpike(sensorType, current, base, sim) {
    var s = sim[sensorType];
    var sp = SIM_CONFIG[sensorType].spike;

    if (s.phase === 'spiking') {
      current = s.targetPeak;
      s.phase = 'decaying';
      s.timer = Math.floor(sp.decayTicksMin + Math.random() * (sp.decayTicksMax - sp.decayTicksMin));
    } else if (s.phase === 'decaying') {
      var decayRate = sp.decayRateMin + Math.random() * (sp.decayRateMax - sp.decayRateMin);
      var diff = current - base;
      current = Math.max(current - diff * decayRate, base);
      s.timer--;
      if (s.timer <= 0 || current <= base + 0.5) {
        s.mode = 'idle';
        s.phase = 'idle';
        s.eventType = null;
        current = base;
      }
    }
    return clamp(round1(current), 1, 90);
  }

  function nextValue(current, base, sensorType, deviceIndex, sim) {
    var s = sim[sensorType];

    /* Check for new event if idle */
    if (s.mode === 'idle') {
      maybeStartEvent(sensorType, deviceIndex, base, sim);
    }

    /* Process current event */
    if (s.mode === 'gradual') {
      return stepGradual(sensorType, current, base, sim);
    } else if (s.mode === 'spike') {
      return stepSpike(sensorType, current, base, sim);
    }

    /* Idle: normal drift + noise */
    var drift = (base - current) * 0.18;
    var noise = (Math.random() - 0.5) * 3;
    var value = current + drift + noise;
    return clamp(round1(value), 1, 90);
  }

  function pushHistory(list, value) {
    list.push(value);
    while (list.length > HISTORY) list.shift();
  }

  function simulate() {
    var devices = state.devices;
    for (var i = 0; i < devices.length; i++) {
      var device = devices[i];
      var base = BASELINE[i] || BASELINE[0];

      device.mq137 = nextValue(device.mq137, base.mq137, 'mq137', i, device.sim);
      device.mq3 = nextValue(device.mq3, base.mq3, 'mq3', i, device.sim);

      /* Determine overall event type for device (priority: spike > gradual > none) */
      var mq137Sim = device.sim.mq137;
      var mq3Sim = device.sim.mq3;
      var eventType = null;
      if (mq137Sim.eventType === 'spike' || mq3Sim.eventType === 'spike') eventType = 'spike';
      else if (mq137Sim.eventType === 'gradual' || mq3Sim.eventType === 'gradual') eventType = 'gradual';

      device.eventType = eventType;
      device.status = classify(device.mq137, device.mq3);
      device.odorIndex = odorIndex(device.mq137, device.mq3);
      device.updatedAt = new Date().toISOString();

      /* Alert duration tracking for gradual Odor Alert events (MQ137 > 35ppm) */
      var tracking = device.alertTracking;
      var isNowAlert = (device.status === 'alert' && device.eventType === 'gradual');

      if (isNowAlert && !tracking.isInAlert) {
        tracking.isInAlert = true;
        tracking.alertStartTime = new Date().toISOString();
        tracking.currentEventType = device.eventType;
        tracking.peakPpm = device.mq137;
      } else if (isNowAlert && tracking.isInAlert) {
        if (device.mq137 > tracking.peakPpm) tracking.peakPpm = device.mq137;
      } else if (!isNowAlert && tracking.isInAlert) {
        var endTime = new Date().toISOString();
        var startTime = new Date(tracking.alertStartTime).getTime();
        var endTimeMs = new Date(endTime).getTime();
        var durationMs = endTimeMs - startTime;

        if (durationMs >= 8000) {
          device.alertHistory.push({
            startTime: tracking.alertStartTime,
            endTime: endTime,
            durationMs: durationMs,
            eventType: tracking.currentEventType,
            peakPpm: tracking.peakPpm
          });
          var cutoff = Date.now() - 24 * 60 * 60 * 1000;
          device.alertHistory = device.alertHistory.filter(function (a) {
            return new Date(a.endTime).getTime() > cutoff;
          });
        }
        tracking.isInAlert = false;
        tracking.alertStartTime = null;
        tracking.currentEventType = null;
        tracking.peakPpm = 0;
      }
    }

    var normal = 0;
    var clean = 0;
    var alert = 0;
    for (var j = 0; j < devices.length; j++) {
      if (devices[j].status === 'alert') alert++;
      else if (devices[j].status === 'clean') clean++;
      else normal++;
    }

    pushHistory(state.history.normal, normal);
    pushHistory(state.history.clean, clean);
    pushHistory(state.history.alert, alert);
    state.lastUpdate = new Date().toISOString();
    state.tick++;
    writeStore();
    return normal + clean + alert;
  }

  function notify() {
    var snapshot = getSnapshot();
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](snapshot);
      } catch (err) {
        console.error(err);
      }
    }
  }

  function getSnapshot() {
    if (!state) state = loadState();
    var normal = 0;
    var clean = 0;
    var alert = 0;
    var normalRooms = [];
    var cleanRooms = [];
    var alertRooms = [];
    for (var i = 0; i < state.devices.length; i++) {
      if (state.devices[i].status === 'alert') {
        alert++;
        alertRooms.push(state.devices[i].room);
      } else if (state.devices[i].status === 'clean') {
        clean++;
        cleanRooms.push(state.devices[i].room);
      } else {
        normal++;
        normalRooms.push(state.devices[i].room);
      }
    }
    var age = Math.max(0, Date.now() - new Date(state.lastUpdate).getTime());
    return {
      devices: state.devices,
      history: state.history,
      lastUpdate: state.lastUpdate,
      ageMs: age,
      stale: age > STALE_MS,
      total: state.devices.length,
      normal: normal,
      clean: clean,
      alert: alert,
      normalRooms: normalRooms,
      cleanRooms: cleanRooms,
      alertRooms: alertRooms,
      thresholds: THRESHOLDS
    };
  }

  function step() {
    if (!state) state = loadState();
    simulate();
    notify();
    return getSnapshot();
  }

  function start() {
    if (!state) state = loadState();
    if (state.tick === 0) {
      for (var i = 0; i < 8; i++) simulate(); /* build a little history */
      notify();
    }
    if (timer) return;
    timer = global.setInterval(step, TICK_MS);
  }

  function stop() {
    if (timer) {
      global.clearInterval(timer);
      timer = null;
    }
  }

  function subscribe(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function unsubscribe() {
      var index = listeners.indexOf(fn);
      if (index > -1) listeners.splice(index, 1);
    };
  }

  function reset() {
    stop();
    state = freshState();
    writeStore();
    notify();
    return getSnapshot();
  }

  global.Telemetry = {
    TICK_MS: TICK_MS,
    HISTORY: HISTORY,
    THRESHOLDS: THRESHOLDS,
    ROOMS: ROOMS,
    start: start,
    stop: stop,
    step: step,
    subscribe: subscribe,
    snapshot: getSnapshot,
    alertCount: function () {
      return getSnapshot().alert;
    },
    reset: reset,
    classify: classify,
    odorIndex: odorIndex
  };
})(typeof window !== 'undefined' ? window : this);