/*
 * AeroClean - core
 * Storage, hashing, validation, session handling and route guards.
 * Everything runs from the browser; data lives in localStorage.
 */
(function (global) {
  'use strict';

  var USERS_KEY = 'aeroclean.users';
  var SESSION_KEY = 'aeroclean.session';
  var PENDING_KEY = 'aeroclean.pendingUser';
  var SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

  /* ------------------------------------------------------------------ *
   * SHA-256 (pure JS so it works from file:// with no dependencies)
   * ------------------------------------------------------------------ */

  var K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  function rotr(x, n) {
    return (x >>> n) | (x << (32 - n));
  }

  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
        out.push(
          0xf0 | (cp >> 18),
          0x80 | ((cp >> 12) & 0x3f),
          0x80 | ((cp >> 6) & 0x3f),
          0x80 | (cp & 0x3f)
        );
      } else {
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }
    return out;
  }

  function sha256(input) {
    var bytes = utf8Bytes(String(input));
    var bitLen = bytes.length * 8;

    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);

    var hi = Math.floor(bitLen / 4294967296);
    var lo = bitLen >>> 0;
    bytes.push(
      (hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
      (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255
    );

    var H = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);
    var w = new Uint32Array(64);

    for (var off = 0; off < bytes.length; off += 64) {
      var i;
      for (i = 0; i < 16; i++) {
        var j = off + i * 4;
        w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
      }
      for (i = 16; i < 64; i++) {
        var x = w[i - 15];
        var y = w[i - 2];
        var s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
        var s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }

      var a = H[0], b = H[1], c = H[2], d = H[3];
      var e = H[4], f = H[5], g = H[6], h = H[7];

      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e;
        e = (d + t1) >>> 0;
        d = c; c = b; b = a;
        a = (t1 + t2) >>> 0;
      }

      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
      H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
      H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }

    var hex = '';
    for (var n = 0; n < 8; n++) {
      hex += ('00000000' + H[n].toString(16)).slice(-8);
    }
    return hex;
  }

  /* ------------------------------------------------------------------ *
   * small helpers
   * ------------------------------------------------------------------ */

  function randomId(prefix) {
    return (prefix || 'u') + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function readJson(key, fallback) {
    try {
      var raw = global.localStorage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (err) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    global.localStorage.setItem(key, JSON.stringify(value));
  }

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function el(id) {
    return document.getElementById(id);
  }

  function fmtDate(value) {
    if (!value) return '—';
    var date = new Date(value);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/);
    var first = parts[0] ? parts[0][0] : '?';
    var last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (first + last).toUpperCase();
  }

  /* ------------------------------------------------------------------ *
   * validation
   * ------------------------------------------------------------------ */

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var SCHOOL_ID_RE = /^[A-Za-z0-9_-]{3,32}$/;
  var PHONE_RE = /^\+?[0-9][0-9\s\-()]{6,19}$/;
  var NAME_RE = /^[\p{L}][\p{L}\s.'-]{2,159}$/u;

  function normalizeSchoolId(value) {
    return String(value === null || value === undefined ? '' : value).trim().toUpperCase();
  }

  function normalizeEmail(value) {
    return String(value === null || value === undefined ? '' : value).trim().toLowerCase();
  }

  var validate = {
    schoolId: function (value) {
      var schoolId = normalizeSchoolId(value);
      if (!schoolId) return { error: 'School ID is required' };
      if (!SCHOOL_ID_RE.test(schoolId)) {
        return { error: 'School ID must be 3-32 letters, numbers, - or _' };
      }
      return { value: schoolId };
    },
    password: function (value, opts) {
      var password = String(value === null || value === undefined ? '' : value);
      if (!password) {
        return opts && opts.required === false ? { value: '' } : { error: 'Password is required' };
      }
      if (password.length < 8) return { error: 'Password must be at least 8 characters' };
      if (password.length > 100) return { error: 'Password must be at most 100 characters' };
      return { value: password };
    },
    fullName: function (value) {
      var fullName = String(value || '').trim().replace(/\s+/g, ' ');
      if (!fullName) return { error: 'Full name is required' };
      if (!NAME_RE.test(fullName)) {
        return { error: "Enter a valid full name (letters, spaces, . ' -)" };
      }
      return { value: fullName };
    },
    email: function (value) {
      var email = normalizeEmail(value);
      if (!email) return { error: 'Email is required' };
      if (email.length > 255 || !EMAIL_RE.test(email)) {
        return { error: 'Enter a valid email address' };
      }
      return { value: email };
    },
    phone: function (value) {
      var phone = String(value || '').trim();
      if (!phone) return { error: 'Phone number is required' };
      if (!PHONE_RE.test(phone)) return { error: 'Enter a valid phone number' };
      return { value: phone };
    },
    role: function (value) {
      var role = String(value || '').trim().toLowerCase();
      if (role !== 'student' && role !== 'personnel') {
        return { error: 'Choose Student or Personnel' };
      }
      return { value: role };
    }
  };

  function validateRegistration(input) {
    input = input || {};
    var errors = {};
    var values = {};
    var checks = [
      ['schoolId', validate.schoolId(input.schoolId)],
      ['fullName', validate.fullName(input.fullName)],
      ['password', validate.password(input.password)],
      ['role', validate.role(input.role)]
    ];
    if (String(input.role || '').toLowerCase() === 'personnel') {
      checks.push(['email', validate.email(input.email)]);
      checks.push(['phone', validate.phone(input.phone)]);
    }
    for (var i = 0; i < checks.length; i++) {
      if (checks[i][1].error) errors[checks[i][0]] = checks[i][1].error;
      else values[checks[i][0]] = checks[i][1].value;
    }
    if (Object.keys(errors).length) {
      return { ok: false, errors: errors, message: 'Please correct the highlighted fields' };
    }
    if (String(values.role || '').toLowerCase() !== 'personnel') {
      values.email = '';
      values.phone = '';
    }
    return { ok: true, values: values };
  }

  function validateLogin(input) {
    input = input || {};
    var errors = {};
    var values = {};
    var schoolId = validate.schoolId(input.schoolId);
    if (schoolId.error) errors.schoolId = schoolId.error;
    else values.schoolId = schoolId.value;

    var password = String(input.password === null || input.password === undefined ? '' : input.password);
    if (!password) errors.password = 'Password is required';
    else values.password = password;

    if (Object.keys(errors).length) {
      return { ok: false, errors: errors, message: 'Please correct the highlighted fields' };
    }
    return { ok: true, values: values };
  }

  /* ------------------------------------------------------------------ *
   * storage + seeding
   * ------------------------------------------------------------------ */

  function makeSalt() {
    var salt = '';
    for (var i = 0; i < 4; i++) salt += Math.random().toString(36).slice(2, 10);
    return salt.slice(0, 16);
  }

  function hashPassword(password, salt) {
    return sha256(salt + '::' + password);
  }

  function seedAdmin(users) {
    for (var i = 0; i < users.length; i++) {
      if (users[i].role === 'admin') return;
    }
    var schoolId = normalizeSchoolId('ADMIN001');
    var salt = makeSalt();
    users.push({
      id: randomId('a'),
      schoolId: schoolId,
      fullName: 'System Administrator',
      email: schoolId.toLowerCase() + '@aeroclean.local',
      phone: '0000000000',
      salt: salt,
      passwordHash: hashPassword('admin123', salt),
      role: 'admin',
      status: 'active',
      createdAt: new Date().toISOString(),
      reviewedAt: null
    });
  }

  function seedGuestStudent(users) {
    for (var i = 0; i < users.length; i++) {
      if (users[i].schoolId === 'GUEST001') return;
    }
    var schoolId = normalizeSchoolId('GUEST001');
    var salt = makeSalt();
    users.push({
      id: randomId('u'),
      schoolId: schoolId,
      fullName: 'Guest',
      email: '',
      phone: '',
      salt: salt,
      passwordHash: hashPassword('guest123', salt),
      role: 'student',
      status: 'active',
      createdAt: new Date().toISOString(),
      reviewedAt: null
    });
  }

  function allUsers() {
    var users = readJson(USERS_KEY, []);
    if (!Array.isArray(users)) users = [];
    seedAdmin(users);
    seedGuestStudent(users);
    try {
      global.localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } catch (err) {
      /* storage full or unavailable - keep working in memory */
    }
    return users;
  }

  function saveUsers(users) {
    writeJson(USERS_KEY, users);
  }

  function findUser(id) {
    var users = allUsers();
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === id) return users[i];
    }
    return null;
  }

  function findUserBySchoolId(schoolId) {
    var target = normalizeSchoolId(schoolId);
    var users = allUsers();
    for (var i = 0; i < users.length; i++) {
      if (users[i].schoolId === target) return users[i];
    }
    return null;
  }

  function publicUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      schoolId: user.schoolId,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      reviewedAt: user.reviewedAt || null
    };
  }

  /* ------------------------------------------------------------------ *
   * registration / login
   * ------------------------------------------------------------------ */

  function register(input) {
    var result = validateRegistration(input);
    if (!result.ok) return { ok: false, errors: result.errors, message: result.message };

    var values = result.values;
    var users = allUsers();
    var errors = {};

    for (var i = 0; i < users.length; i++) {
      if (users[i].schoolId === values.schoolId) {
        errors.schoolId = 'This School ID is already registered';
      }
      if (values.email && users[i].email === values.email) {
        errors.email = 'This email is already registered';
      }
    }
    if (Object.keys(errors).length) {
      return {
        ok: false,
        errors: errors,
        message: 'An account with these details already exists'
      };
    }

    var salt = makeSalt();
    var status = values.role === 'personnel' ? 'pending' : 'active';
    var user = {
      id: randomId('u'),
      schoolId: values.schoolId,
      fullName: values.fullName,
      email: values.email,
      phone: values.phone,
      salt: salt,
      passwordHash: hashPassword(values.password, salt),
      role: values.role,
      status: status,
      createdAt: new Date().toISOString(),
      reviewedAt: null
    };

    users.push(user);
    saveUsers(users);

    return {
      ok: true,
      user: publicUser(user),
      status: status,
      message:
        status === 'pending'
          ? 'Registration received. Your personnel account must be approved by an administrator before you can sign in.'
          : 'Account created. You can sign in now.'
    };
  }

  function authenticate(schoolId, password) {
    var check = validateLogin({ schoolId: schoolId, password: password });
    if (!check.ok) {
      return { ok: false, code: 'INVALID', errors: check.errors, message: check.message };
    }

    var user = findUserBySchoolId(check.values.schoolId);
    var matches =
      !!user && hashPassword(check.values.password, user.salt) === user.passwordHash;

    if (!user || !matches) {
      return {
        ok: false,
        code: 'BAD_CREDENTIALS',
        errors: { password: 'Invalid School ID or password' },
        message: 'Invalid School ID or password'
      };
    }

    if (user.role !== 'admin') {
      if (user.status === 'pending') {
        return {
          ok: false,
          code: 'PENDING',
          pendingUserId: user.id,
          message: 'Your personnel account is awaiting administrator approval.'
        };
      }
      if (user.status === 'declined') {
        return {
          ok: false,
          code: 'DECLINED',
          errors: { password: 'This account was not approved' },
          message: 'Your account was not approved. Please contact the administrator.'
        };
      }
    }

    return { ok: true, user: publicUser(user) };
  }

  /* ------------------------------------------------------------------ *
   * session
   * ------------------------------------------------------------------ */

  function getSession() {
    var session = readJson(SESSION_KEY, null);
    if (!session || !session.userId) return null;
    if (session.expiresAt && Date.now() > session.expiresAt) {
      logout();
      return null;
    }
    return session;
  }

  function currentUser() {
    var session = getSession();
    if (!session) return null;
    var user = findUser(session.userId);
    if (!user) {
      logout();
      return null;
    }
    return publicUser(user);
  }

  function login(user) {
    writeJson(SESSION_KEY, {
      userId: user.id,
      expiresAt: Date.now() + SESSION_TTL
    });
    clearPendingUser();
  }

  function logout() {
    try {
      global.localStorage.removeItem(SESSION_KEY);
    } catch (err) { /* ignore */ }
  }

  function homeFor(role) {
    return 'dashboard-monitor.html';
  }

  function accountPageFor(role) {
    if (role === 'admin') return 'dashboard-monitor.html';
    if (role === 'personnel') return 'dashboard-personnel.html';
    return 'dashboard-student.html';
  }

  function go(page) {
    global.location.href = page;
  }

  /* pending marker: remembers a blocked personnel login attempt */

  function setPendingUser(userId) {
    global.localStorage.setItem(PENDING_KEY, userId);
  }

  function clearPendingUser() {
    try {
      global.localStorage.removeItem(PENDING_KEY);
    } catch (err) { /* ignore */ }
  }

  function pendingUser() {
    var id = global.localStorage.getItem(PENDING_KEY);
    if (!id) return null;
    return findUser(id);
  }

  /* ------------------------------------------------------------------ *
   * route guards
   * ------------------------------------------------------------------ */

  function require(roles) {
    var user = currentUser();
    if (!user) {
      go('index.html');
      return null;
    }
    if (user.status === 'pending') {
      setPendingUser(user.id);
      logout();
      go('pending.html');
      return null;
    }
    if (user.status === 'declined') {
      logout();
      go('index.html');
      return null;
    }
    if (roles && roles.indexOf(user.role) === -1) {
      go(homeFor(user.role));
      return null;
    }
    return user;
  }

  function redirectIfSignedIn() {
    var user = currentUser();
    if (user && user.status === 'active') {
      go(homeFor(user.role));
      return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------ *
   * admin actions
   * ------------------------------------------------------------------ */

  function reviewAccount(userId, action) {
    if (action !== 'approve' && action !== 'declined' && action !== 'decline' && action !== 'deactivate' && action !== 'reactivate') {
      return { ok: false, message: 'Unknown action' };
    }
    var users = allUsers();
    var target = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].id === userId) {
        target = users[i];
        break;
      }
    }
    if (!target) return { ok: false, message: 'Account not found' };
    if (target.role === 'admin') {
      return { ok: false, message: 'Admin accounts cannot be deactivated' };
    }

    if (action === 'approve' || action === 'reactivate') {
      target.status = 'active';
    } else if (action === 'deactivate') {
      target.status = 'declined';
    } else {
      target.status = 'declined';
    }
    target.reviewedAt = new Date().toISOString();
    saveUsers(users);
    return { ok: true, user: publicUser(target) };
  }

  function resetDemo() {
    try {
      global.localStorage.removeItem(USERS_KEY);
      global.localStorage.removeItem(SESSION_KEY);
      global.localStorage.removeItem(PENDING_KEY);
      global.localStorage.removeItem('aeroclean.telemetry');
      if (typeof Telemetry !== 'undefined' && Telemetry.reset) Telemetry.reset();
    } catch (err) { /* ignore */ }
    allUsers();
  }

  /* ------------------------------------------------------------------ *
   * reports storage
   * ------------------------------------------------------------------ */

  var REPORTS_KEY = 'aeroclean.reports';

  var REPORT_TYPES = {
    ALERT_FIXED: 'alert_fixed',
    MAINTENANCE_COMPLETE: 'maintenance_complete',
    BROKEN_DEVICE: 'broken_device'
  };

  var VALID_REPORT_TYPES = ['alert_fixed', 'maintenance_complete', 'broken_device'];

  var REPORT_TYPE_LABELS = {
    alert_fixed: 'Alert Fixed',
    maintenance_complete: 'Maintenance Complete',
    broken_device: 'Broken Device'
  };

  function readReports() {
    try {
      var raw = global.localStorage.getItem(REPORTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  }

  function writeReports(reports) {
    try {
      global.localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
    } catch (err) {
      /* storage full */
    }
  }

  function getDeviceSnapshot(deviceId) {
    var rooms = Telemetry ? Telemetry.ROOMS : [];
    var room = null;
    for (var i = 0; i < rooms.length; i++) {
      if (rooms[i].nodeId === deviceId) {
        room = rooms[i];
        break;
      }
    }
    if (!room) return { room: 'Unknown', nodeId: deviceId, type: 'Unknown', status: 'normal' };
    var snapshot = Telemetry.snapshot();
    var device = snapshot.devices.find(function(d) { return d.nodeId === deviceId; });
    return {
      room: room.room,
      nodeId: room.nodeId,
      type: room.type,
      status: device ? device.status : 'normal'
    };
  }

  function createReport(type, deviceId, note) {
    var user = currentUser();
    if (!user || user.role !== 'personnel') {
      return { ok: false, message: 'Only personnel can create reports' };
    }
    if (!VALID_REPORT_TYPES.includes(type)) {
      return { ok: false, message: 'Invalid report type' };
    }
    var deviceSnap = getDeviceSnapshot(deviceId);
    var report = {
      id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId: user.id,
      userName: user.fullName,
      userSchoolId: user.schoolId,
      type: type,
      deviceId: deviceId,
      deviceRoom: deviceSnap.room,
      deviceStatusAtReport: deviceSnap.status,
      note: note || '',
      createdAt: new Date().toISOString(),
      archived: false
    };
    var reports = readReports();
    reports.unshift(report);
    writeReports(reports);
    return { ok: true, report: report };
  }

  function getReports() {
    var reports = readReports();
    return reports.sort(function(a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }

  function getReportsByUser(userId) {
    return getReports().filter(function(r) { return r.userId === userId; });
  }

  function archiveReport(reportId) {
    var reports = readReports();
    for (var i = 0; i < reports.length; i++) {
      if (reports[i].id === reportId) {
        reports[i].archived = true;
        writeReports(reports);
        return { ok: true };
      }
    }
    return { ok: false, message: 'Report not found' };
  }

  function restoreReport(reportId) {
    var reports = readReports();
    for (var i = 0; i < reports.length; i++) {
      if (reports[i].id === reportId) {
        reports[i].archived = false;
        writeReports(reports);
        return { ok: true };
      }
    }
    return { ok: false, message: 'Report not found' };
  }

  function getArchivedReports() {
    return getReports().filter(function(r) { return r.archived; });
  }

  function getActiveReports() {
    return getReports().filter(function(r) { return !r.archived; });
  }

  /* ------------------------------------------------------------------ *
   * schedules storage
   * ------------------------------------------------------------------ */

  var SCHEDULES_KEY = 'aeroclean.schedules';

  var RECURRENCE_TYPES = {
    NONE: 'none',
    DAILY: 'daily',
    WEEKLY: 'weekly'
  };

  var RECURRENCE_LABELS = {
    none: 'One-time',
    daily: 'Daily',
    weekly: 'Weekly'
  };

  function readSchedules() {
    try {
      var raw = global.localStorage.getItem(SCHEDULES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  }

  function writeSchedules(schedules) {
    try {
      global.localStorage.setItem(SCHEDULES_KEY, JSON.stringify(schedules));
    } catch (err) {
      /* storage full */
    }
  }

  function getRoomName(roomId) {
    var rooms = Telemetry ? Telemetry.ROOMS : [];
    for (var i = 0; i < rooms.length; i++) {
      if (rooms[i].nodeId === roomId) return rooms[i].room;
    }
    return 'Unknown Room';
  }

  function getPersonnelName(personnelId) {
    if (!personnelId) return 'Unassigned';
    var user = findUser(personnelId);
    return user ? user.fullName : 'Unknown';
  }

  function timeToMinutes(time24) {
    var parts = String(time24).split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || 0, 10);
  }

  function minutesToTime24(mins) {
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function formatTime12h(time24) {
    if (!time24) return '\u2014';
    var parts = String(time24).split(':');
    var h = parseInt(parts[0], 10);
    var m = parts[1] || '00';
    var ampm = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ':' + m + ' ' + ampm;
  }

  function getEventStatus(date, startTime, endTime) {
    var now = new Date();
    var eventStart = new Date(date + 'T' + startTime);
    var eventEnd = new Date(date + 'T' + endTime);
    if (now < eventStart) return 'upcoming';
    if (now > eventEnd) return 'completed';
    return 'ongoing';
  }

  function statusBadge(status) {
    var cls = 'badge-status-' + status;
    var label = status.charAt(0).toUpperCase() + status.slice(1);
    return '<span class="badge ' + cls + '">' + label + '</span>';
  }

  function recurrenceBadge(recurrence) {
    var label = RECURRENCE_LABELS[recurrence] || recurrence;
    var cls = 'badge-recurrence-' + recurrence;
    return '<span class="badge ' + cls + '">' + label + '</span>';
  }

  function addDays(dateStr, days) {
    var date = new Date(dateStr + 'T00:00:00');
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }

  function getOccurrences(schedule, rangeStart, rangeEnd) {
    var occurrences = [];
    var baseDate = schedule.date;
    var start = timeToMinutes(schedule.startTime);
    var end = timeToMinutes(schedule.endTime);
    var recurrence = schedule.recurrence || RECURRENCE_TYPES.NONE;
    var recurrenceEnd = schedule.recurrenceEnd ? new Date(schedule.recurrenceEnd + 'T00:00:00') : null;
    var rangeEndDate = new Date(rangeEnd + 'T00:00:00');
    var current = new Date(baseDate + 'T00:00:00');
    var maxIterations = 400;

    var personnelId = schedule.personnelId || null;
    var personnelName = schedule.personnelName || getPersonnelName(personnelId);

    if (recurrence === RECURRENCE_TYPES.NONE) {
      if (baseDate >= rangeStart && baseDate <= rangeEnd) {
        occurrences.push({
          id: schedule.id,
          baseId: schedule.id,
          date: baseDate,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          title: schedule.title,
          description: schedule.description,
          roomId: schedule.roomId,
          roomName: schedule.roomName,
          recurrence: recurrence,
          status: getEventStatus(baseDate, schedule.startTime, schedule.endTime),
          isRecurringInstance: false,
          personnelId: personnelId,
          personnelName: personnelName
        });
      }
      return occurrences;
    }

    var stepDays = recurrence === RECURRENCE_TYPES.DAILY ? 1 : 7;
    var limitDate = recurrenceEnd && recurrenceEnd < rangeEndDate ? recurrenceEnd : rangeEndDate;

    while (current <= limitDate && maxIterations-- > 0) {
      var dateStr = current.toISOString().slice(0, 10);
      if (dateStr >= rangeStart) {
        occurrences.push({
          id: schedule.id + '_' + dateStr,
          baseId: schedule.id,
          date: dateStr,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          title: schedule.title,
          description: schedule.description,
          roomId: schedule.roomId,
          roomName: schedule.roomName,
          recurrence: recurrence,
          status: getEventStatus(dateStr, schedule.startTime, schedule.endTime),
          isRecurringInstance: true,
          personnelId: personnelId,
          personnelName: personnelName
        });
      }
      current.setDate(current.getDate() + stepDays);
    }
    return occurrences;
  }

  function getAllOccurrencesInRange(rangeStart, rangeEnd) {
    var schedules = readSchedules();
    var all = [];
    for (var i = 0; i < schedules.length; i++) {
      if (schedules[i].status === 'cancelled') continue;
      var occs = getOccurrences(schedules[i], rangeStart, rangeEnd);
      all.push.apply(all, occs);
    }
    all.sort(function(a, b) {
      var dateCmp = String(a.date).localeCompare(String(b.date));
      if (dateCmp !== 0) return dateCmp;
      return String(a.startTime).localeCompare(String(b.startTime));
    });
    return all;
  }

  function timeOverlap(start1, end1, start2, end2) {
    var s1 = timeToMinutes(start1);
    var e1 = timeToMinutes(end1);
    var s2 = timeToMinutes(start2);
    var e2 = timeToMinutes(end2);
    return s1 < e2 && s2 < e1;
  }

  function checkConflicts(roomId, date, startTime, endTime, recurrence, recurrenceEnd, excludeId, personnelId) {
    var schedules = readSchedules();
    var checkStart = date;
    var checkEnd = recurrenceEnd || addDays(date, 30);
    for (var i = 0; i < schedules.length; i++) {
      var s = schedules[i];
      if (s.id === excludeId) continue;
      if (s.roomId !== roomId) continue;
      if (s.status === 'cancelled') continue;
      var occs = getOccurrences(s, checkStart, checkEnd);
      for (var j = 0; j < occs.length; j++) {
        if (timeOverlap(startTime, endTime, occs[j].startTime, occs[j].endTime)) {
          return { conflict: true, existing: s, occurrence: occs[j] };
        }
      }
    }
    if (personnelId) {
      for (var k = 0; k < schedules.length; k++) {
        var s2 = schedules[k];
        if (s2.id === excludeId) continue;
        if (s2.personnelId !== personnelId) continue;
        if (s2.status === 'cancelled') continue;
        var occs2 = getOccurrences(s2, checkStart, checkEnd);
        for (var m = 0; m < occs2.length; m++) {
          if (timeOverlap(startTime, endTime, occs2[m].startTime, occs2[m].endTime)) {
            return { conflict: true, type: 'personnel', existing: s2, occurrence: occs2[m] };
          }
        }
      }
    }
    return { conflict: false };
  }

  function validateSchedule(data) {
    var errors = {};
    if (!data.roomId) errors.roomId = 'Room is required';
    if (!data.date) errors.date = 'Date is required';
    if (!data.startTime) errors.startTime = 'Start time is required';
    if (!data.endTime) errors.endTime = 'End time is required';
    if (data.startTime && data.endTime) {
      if (timeToMinutes(data.startTime) >= timeToMinutes(data.endTime)) {
        errors.endTime = 'End time must be after start time';
      }
    }
    if (!data.title || !data.title.trim()) errors.title = 'Title is required';
    if (data.title && data.title.length > 100) errors.title = 'Title must be 100 characters or less';
    if (data.description && data.description.length > 500) errors.description = 'Description must be 500 characters or less';
    var validRecurrence = [RECURRENCE_TYPES.NONE, RECURRENCE_TYPES.DAILY, RECURRENCE_TYPES.WEEKLY];
    if (data.recurrence && !validRecurrence.includes(data.recurrence)) {
      errors.recurrence = 'Invalid recurrence type';
    }
    if (data.recurrence !== RECURRENCE_TYPES.NONE && data.recurrenceEnd) {
      if (data.recurrenceEnd < data.date) {
        errors.recurrenceEnd = 'Recurrence end date must be on or after start date';
      }
    }
    if (Object.keys(errors).length) {
      return { ok: false, errors: errors, message: 'Please correct the highlighted fields' };
    }
    return { ok: true, values: data };
  }

  function createSchedule(data) {
    var user = currentUser();
    if (!user || user.role !== 'admin') {
      return { ok: false, message: 'Only administrators can create schedules' };
    }
    var result = validateSchedule(data);
    if (!result.ok) return result;
    var values = result.values;
    var conflict = checkConflicts(values.roomId, values.date, values.startTime, values.endTime, values.recurrence, values.recurrenceEnd, null, values.personnelId || null);
    if (conflict.conflict) {
      return { ok: false, message: 'Schedule conflicts with existing schedule on ' + conflict.occurrence.date + ' at ' + formatTime12h(conflict.occurrence.startTime), errors: { date: 'Conflict with existing schedule' } };
    }
    var schedule = {
      id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      roomId: values.roomId,
      roomName: getRoomName(values.roomId),
      date: values.date,
      startTime: values.startTime,
      endTime: values.endTime,
      title: values.title.trim(),
      description: values.description ? values.description.trim() : '',
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      recurrence: values.recurrence || RECURRENCE_TYPES.NONE,
      recurrenceEnd: values.recurrenceEnd || null,
      status: 'active',
      personnelId: values.personnelId || null,
      personnelName: getPersonnelName(values.personnelId)
    };
    var schedules = readSchedules();
    schedules.push(schedule);
    writeSchedules(schedules);
    return { ok: true, schedule: schedule };
  }

  function updateSchedule(id, data) {
    var user = currentUser();
    if (!user || user.role !== 'admin') {
      return { ok: false, message: 'Only administrators can update schedules' };
    }
    var schedules = readSchedules();
    var index = -1;
    for (var i = 0; i < schedules.length; i++) {
      if (schedules[i].id === id) {
        index = i;
        break;
      }
    }
    if (index === -1) return { ok: false, message: 'Schedule not found' };
    var existing = schedules[index];
    var merged = Object.assign({}, existing, data);
    var result = validateSchedule(merged);
    if (!result.ok) return result;
    var values = result.values;
    var conflict = checkConflicts(values.roomId, values.date, values.startTime, values.endTime, values.recurrence, values.recurrenceEnd, id, values.personnelId || null);
    if (conflict.conflict) {
      return { ok: false, message: 'Schedule conflicts with existing schedule on ' + conflict.occurrence.date + ' at ' + formatTime12h(conflict.occurrence.startTime), errors: { date: 'Conflict with existing schedule' } };
    }
    schedules[index] = Object.assign({}, existing, values, {
      personnelId: values.personnelId || null,
      personnelName: getPersonnelName(values.personnelId)
    });
    writeSchedules(schedules);
    return { ok: true, schedule: schedules[index] };
  }

  function deleteSchedule(id) {
    var user = currentUser();
    if (!user || user.role !== 'admin') {
      return { ok: false, message: 'Only administrators can delete schedules' };
    }
    var schedules = readSchedules();
    for (var i = 0; i < schedules.length; i++) {
      if (schedules[i].id === id) {
        schedules[i].status = 'cancelled';
        writeSchedules(schedules);
        return { ok: true };
      }
    }
    return { ok: false, message: 'Schedule not found' };
  }

  function getSchedules(opts) {
    opts = opts || {};
    var schedules = readSchedules();
    if (opts.status) {
      schedules = schedules.filter(function(s) { return s.status === opts.status; });
    }
    if (opts.roomId) {
      schedules = schedules.filter(function(s) { return s.roomId === opts.roomId; });
    }
    if (opts.createdBy) {
      schedules = schedules.filter(function(s) { return s.createdBy === opts.createdBy; });
    }
    return schedules.sort(function(a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }

  /* ------------------------------------------------------------------ *
   * form + toast helpers
   * ------------------------------------------------------------------ */

  function clearErrors(form) {
    if (!form) return;
    var fields = form.querySelectorAll('.field');
    for (var i = 0; i < fields.length; i++) fields[i].classList.remove('has-error');
    var errors = form.querySelectorAll('.field-error');
    for (var j = 0; j < errors.length; j++) errors[j].textContent = '';
  }

  function showErrors(form, errors) {
    if (!form || !errors) return;
    for (var key in errors) {
      if (!Object.prototype.hasOwnProperty.call(errors, key)) continue;
      var node = form.querySelector('[data-error-for="' + key + '"]');
      if (!node) continue;
      node.textContent = errors[key];
      var field = node.closest('.field');
      if (field) field.classList.add('has-error');
    }
  }

  function setAlert(node, message, type) {
    if (!node) return;
    if (!message) {
      node.hidden = true;
      node.textContent = '';
      node.className = 'alert';
      return;
    }
    node.hidden = false;
    node.textContent = message;
    node.className = 'alert alert-' + (type || 'error');
  }

  function toastRoot() {
    var root = document.getElementById('toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'toast-root';
      document.body.appendChild(root);
    }
    return root;
  }

  function toast(message, type) {
    var node = document.createElement('div');
    node.className = 'toast is-' + (type || 'info');
    node.textContent = message;
    toastRoot().appendChild(node);
    global.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 3600);
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  /* ------------------------------------------------------------------ *
   * public API
   * ------------------------------------------------------------------ */

  global.Aero = {
    sha256: sha256,
    hashPassword: hashPassword,
    validate: validate,
    validateRegistration: validateRegistration,
    validateLogin: validateLogin,
    normalizeSchoolId: normalizeSchoolId,
    normalizeEmail: normalizeEmail,
    allUsers: allUsers,
    findUser: findUser,
    findUserBySchoolId: findUserBySchoolId,
    publicUser: publicUser,
    register: register,
    authenticate: authenticate,
    currentUser: currentUser,
    login: login,
    logout: logout,
    homeFor: homeFor,
    accountPageFor: accountPageFor,
    require: require,
    redirectIfSignedIn: redirectIfSignedIn,
    setPendingUser: setPendingUser,
    clearPendingUser: clearPendingUser,
    pendingUser: pendingUser,
    reviewAccount: reviewAccount,
    resetDemo: resetDemo,
    createReport: createReport,
    getReports: getReports,
    getReportsByUser: getReportsByUser,
    archiveReport: archiveReport,
    restoreReport: restoreReport,
    getArchivedReports: getArchivedReports,
    getActiveReports: getActiveReports,
    REPORT_TYPES: REPORT_TYPES,
    REPORT_TYPE_LABELS: REPORT_TYPE_LABELS,
    readSchedules: readSchedules,
    writeSchedules: writeSchedules,
    createSchedule: createSchedule,
    updateSchedule: updateSchedule,
    deleteSchedule: deleteSchedule,
    getSchedules: getSchedules,
    getOccurrences: getOccurrences,
    getAllOccurrencesInRange: getAllOccurrencesInRange,
    checkConflicts: checkConflicts,
    formatTime12h: formatTime12h,
    getEventStatus: getEventStatus,
    statusBadge: statusBadge,
    recurrenceBadge: recurrenceBadge,
    RECURRENCE_TYPES: RECURRENCE_TYPES,
    RECURRENCE_LABELS: RECURRENCE_LABELS,
    esc: esc,
    el: el,
    fmtDate: fmtDate,
    initials: initials,
    clearErrors: clearErrors,
    showErrors: showErrors,
    setAlert: setAlert,
    toast: toast,
    onReady: onReady
  };
})(typeof window !== 'undefined' ? window : this);
