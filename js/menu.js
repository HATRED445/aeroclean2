Aero.onReady(function () {
  'use strict';

  var mount = Aero.el('app-menu');
  var topbarMount = Aero.el('topbar-menu');
  if (!mount && !topbarMount) return;

  var user = Aero.currentUser();
  if (!user || user.status !== 'active') return;

  var page = window.location.pathname.split('/').pop() || 'index.html';
  var links;
  if (user.role === 'admin') {
    links = [
      { href: 'dashboard-monitor.html', label: 'Dashboard', section: 'menu' },
      { href: 'schedule.html', label: 'Schedules', section: 'menu' },
      { href: 'reports.html', label: 'Reports', section: 'menu' },
      { href: 'recent-alerts.html', label: 'Recent Alerts', section: 'menu' },
      { href: 'admin.html', label: 'Accounts', section: 'menu' }
    ];
  } else if (user.role === 'personnel') {
    links = [
      { href: 'dashboard-monitor.html', label: 'Dashboard', section: 'menu' },
      { href: 'schedule.html', label: 'Schedules', section: 'menu' },
      { href: 'reports-personnel.html', label: 'Reports', section: 'menu' },
      { href: 'recent-alerts.html', label: 'Recent Alerts', section: 'menu' },
      { href: Aero.accountPageFor(user.role), label: 'Account details', section: 'menu' }
    ];
  } else {
    links = [
      { href: 'dashboard-monitor.html', label: 'Dashboard', section: 'menu' },
      { href: Aero.accountPageFor(user.role), label: 'Account details', section: 'menu' }
    ];
  }

  links.push({ href: 'feedback.html', label: 'Feedback', section: 'menu' });

  function linkMarkup(link) {
    var hashIndex = link.href.indexOf('#');
    var target = hashIndex === -1 ? link.href : link.href.slice(0, hashIndex);
    var hash = hashIndex === -1 ? '' : link.href.slice(hashIndex);
    var active = target === page && hash === window.location.hash;
    return (
      '<a class="drawer-link' + (active ? ' is-active' : '') + '" href="' + Aero.esc(link.href) + '">' +
      '<span>' + Aero.esc(link.label) + '</span><span aria-hidden="true">&rsaquo;</span></a>'
    );
  }

  var drawerHtml =
    '<div class="drawer-backdrop" data-menu-close></div>' +
    '<aside class="drawer" id="drawer" aria-label="Main menu" aria-hidden="true">' +
      '<div class="drawer-head">' +
        '<div class="drawer-avatar">' + Aero.esc(Aero.initials(user.fullName)) + '</div>' +
        '<div>' +
          '<div class="drawer-name">' + Aero.esc(user.fullName) + '</div>' +
          '<div class="drawer-meta">' + Aero.esc(user.schoolId === 'GUEST001' ? 'guest' : user.role) + ' · ' + Aero.esc(user.schoolId) + '</div>' +
        '</div>' +
      '</div>' +
      '<nav class="drawer-nav">' +
        '<span class="drawer-section">Menu</span>' +
        links.map(linkMarkup).join('') +
        '<div class="divider"></div>' +
        '<button type="button" class="btn btn-primary btn-block" id="menu-logout">Sign out</button>' +
      '</nav>' +
      '<p class="drawer-foot">AeroClean · readings simulated on this device</p>' +
    '</aside>';

  var buttonHtml =
    '<button type="button" class="menu-btn" id="menu-btn" aria-label="Open menu" aria-expanded="false">' +
      '<span class="bar"></span><span class="bar"></span><span class="bar"></span>' +
    '</button>' +
    '<span class="alert-pill" id="alert-pill" title="Rooms currently in odor alert">0</span>';

  if (topbarMount) topbarMount.innerHTML = buttonHtml;
  mount.innerHTML = drawerHtml;

  var root = mount;
  var button = Aero.el('menu-btn');
  var drawer = Aero.el('drawer');

  function setOpen(open) {
    root.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.style.overflow = open ? 'hidden' : '';
  }

  button.addEventListener('click', function () {
    setOpen(!root.classList.contains('is-open'));
  });

  mount
    .querySelector('.drawer-backdrop')
    .addEventListener('click', function () {
      setOpen(false);
    });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && root.classList.contains('is-open')) setOpen(false);
  });

  var logout = Aero.el('menu-logout');
  if (logout) {
    logout.addEventListener('click', function () {
      Aero.logout();
      Aero.clearPendingUser();
      window.location.href = 'index.html';
    });
  }

  function updatePill(snapshot) {
    var pill = Aero.el('alert-pill');
    if (!pill) return;
    pill.textContent = snapshot.alert;
    pill.classList.toggle('is-hot', snapshot.alert > 0);
    pill.setAttribute(
      'title',
      snapshot.alert > 0
        ? snapshot.alert + ' room(s) in odor alert'
        : 'All rooms in normal odor'
    );
  }

  if (typeof Telemetry !== 'undefined') {
    Telemetry.start();
    updatePill(Telemetry.snapshot());
    Telemetry.subscribe(updatePill);
  }
});
