Aero.onReady(function () {
  'use strict';

  var allowed = document.body.getAttribute('data-allowed');
  var user = Aero.require(allowed ? [allowed] : null);
  if (!user) return;

  function greeting() {
    var hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  /* these fields only exist on one of the two dashboard pages */
  function setOptional(id, value) {
    var node = Aero.el(id);
    if (node) node.textContent = value;
  }

  Aero.el('avatar').textContent = Aero.initials(user.fullName);
  Aero.el('full-name').textContent = user.fullName;
  Aero.el('greeting').textContent =
    greeting() + ' · ' + (user.role === 'personnel' ? 'Personnel account' : user.schoolId === 'GUEST001' ? 'Guest account' : 'Student account');

  Aero.el('f-full-name').textContent = user.fullName;
  Aero.el('f-school-id').textContent = user.schoolId;
  Aero.el('f-email').textContent = user.email;
  Aero.el('f-phone').textContent = user.phone;
  Aero.el('f-created').textContent = Aero.fmtDate(user.createdAt);

  setOptional(
    'f-status',
    user.status === 'active' ? 'Active' : user.status === 'pending' ? 'Pending' : 'Declined'
  );
  setOptional('f-reviewed', Aero.fmtDate(user.reviewedAt));

  var statusBadge = Aero.el('status-badge');
  statusBadge.className = 'badge badge-' + user.status;
  statusBadge.textContent = user.status;
});
