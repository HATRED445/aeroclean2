Aero.onReady(function () {
  'use strict';

  var admin = Aero.require(['admin']);
  if (!admin) return;

  var esc = Aero.esc;

  function roleBadge(role) {
    return '<span class="badge badge-' + esc(role) + '">' + esc(role) + '</span>';
  }

  function statusBadge(status) {
    return '<span class="badge badge-' + esc(status) + '">' + esc(status) + '</span>';
  }

  function reactivateBtn(id) {
    return (
      '<button type="button" class="btn btn-sm btn-ok" data-action="reactivate" data-id="' +
      esc(id) +
      '">Reactivate</button>'
    );
  }

  function deactivatedRow(user) {
    return (
      '<tr>' +
      '<td class="cell-name">' + esc(user.fullName) + '</td>' +
      '<td>' + esc(user.schoolId) + '</td>' +
      '<td>' + esc(user.email) + '</td>' +
      '<td>' + esc(user.phone) + '</td>' +
      '<td>' + Aero.fmtDate(user.createdAt) + '</td>' +
      '<td>' + Aero.fmtDate(user.reviewedAt) + '</td>' +
      '<td class="cell-actions">' + reactivateBtn(user.id) + '</td>' +
      '</tr>'
    );
  }

  function renderDeactivated(users) {
    var deactivated = users
      .filter(function (user) {
        return user.role === 'personnel' && user.status === 'declined';
      })
      .sort(function (a, b) {
        return String(b.reviewedAt || '').localeCompare(String(a.reviewedAt || ''));
      });

    var count = deactivated.length + ' deactivated';
    Aero.el('deactivated-count').textContent = count;

    Aero.el('deactivated-body').innerHTML = deactivated.map(deactivatedRow).join('');
    Aero.el('deactivated-wrap').hidden = deactivated.length === 0;
    Aero.el('deactivated-empty').hidden = deactivated.length !== 0;
  }

  function render() {
    var users = Aero.allUsers();
    renderDeactivated(users);
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var button = target.closest('[data-action]');
    if (!button) return;

    var result = Aero.reviewAccount(
      button.getAttribute('data-id'),
      button.getAttribute('data-action')
    );

    if (!result.ok) {
      Aero.toast(result.message, 'error');
      return;
    }

    if (result.user.status === 'active') {
      Aero.toast(result.user.fullName + ' has been reactivated.', 'success');
    } else {
      Aero.toast(result.user.fullName + ' was deactivated.', 'info');
    }
    render();
  });

  render();
});