Aero.onReady(function () {
  'use strict';

  var admin = Aero.require(['admin']);
  if (!admin) return;

  var esc = Aero.esc;

  Aero.el('admin-name').textContent = admin.fullName + ' (' + admin.schoolId + ')';

  function roleBadge(role) {
    return '<span class="badge badge-' + esc(role) + '">' + esc(role) + '</span>';
  }

  function statusBadge(status) {
    return '<span class="badge badge-' + esc(status) + '">' + esc(status) + '</span>';
  }

  function approveBtn(id) {
    return (
      '<button type="button" class="btn btn-sm btn-ok" data-action="approve" data-id="' +
      esc(id) +
      '">Accept</button>'
    );
  }

  function declineBtn(id) {
    return (
      '<button type="button" class="btn btn-sm btn-danger" data-action="decline" data-id="' +
      esc(id) +
      '">Decline</button>'
    );
  }

  function pendingRow(user) {
    return (
      '<tr>' +
      '<td class="cell-name">' + esc(user.fullName) + '</td>' +
      '<td>' + esc(user.schoolId) + '</td>' +
      '<td>' + esc(user.email) + '</td>' +
      '<td>' + esc(user.phone) + '</td>' +
      '<td>' + Aero.fmtDate(user.createdAt) + '</td>' +
      '<td class="cell-actions">' + approveBtn(user.id) + ' ' + declineBtn(user.id) + '</td>' +
      '</tr>'
    );
  }

  function accountActions(user) {
    if (user.role !== 'personnel') return '<span class="muted">—</span>';
    if (user.status === 'pending') return approveBtn(user.id) + ' ' + declineBtn(user.id);
    if (user.status === 'declined') return '<span class="muted">—</span>';
    if (user.status === 'active') return deactivateBtn(user.id);
    return '<span class="muted">—</span>';
  }

  function deactivateBtn(id) {
    return (
      '<button type="button" class="btn btn-sm btn-danger" data-action="deactivate" data-id="' +
      esc(id) +
      '">Deactivate</button>'
    );
  }

  function accountRow(user) {
    return (
      '<tr>' +
      '<td class="cell-name">' + esc(user.fullName) + '<br><span class="muted">' + esc(user.email) + '</span></td>' +
      '<td>' + esc(user.schoolId) + '</td>' +
      '<td>' + statusBadge(user.status) + '</td>' +
      '<td>' + Aero.fmtDate(user.createdAt) + '</td>' +
      '<td class="cell-actions">' + accountActions(user) + '</td>' +
      '</tr>'
    );
  }

  function renderStats(users) {
    var pending = 0;
    var personnel = 0;

    for (var i = 0; i < users.length; i++) {
      var user = users[i];
      if (user.role === 'personnel') {
        personnel++;
        if (user.status === 'pending') pending++;
      }
    }

    Aero.el('stat-total').textContent = personnel;
    Aero.el('stat-pending').textContent = pending;
    Aero.el('stat-personnel').textContent = personnel;
  }

  function renderAccounts(users) {
    var statusFilter = Aero.el('filter-status').value;
    var search = Aero.el('filter-search').value.trim().toLowerCase();

    var filtered = users
      .filter(function (user) {
        if (user.role !== 'personnel') return false;
        var statusOk = statusFilter === 'all' || user.status === statusFilter;
        var searchOk = !search ||
          user.fullName.toLowerCase().includes(search) ||
          user.schoolId.toLowerCase().includes(search) ||
          user.email.toLowerCase().includes(search) ||
          user.phone.toLowerCase().includes(search);
        return statusOk && searchOk;
      })
      .sort(function (a, b) {
        if (a.role === 'admin') return -1;
        if (b.role === 'admin') return 1;
        return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      });

    Aero.el('accounts-body').innerHTML = filtered.map(accountRow).join('');
    Aero.el('accounts-wrap').hidden = filtered.length === 0;
    Aero.el('accounts-empty').hidden = filtered.length !== 0;
  }

  function render() {
    var users = Aero.allUsers();
    renderStats(users);
    renderAccounts(users);
  }

  Aero.el('filter-status').addEventListener('change', render);

  var searchDebounce;
  var searchInput = Aero.el('filter-search');
  var searchBtn = Aero.el('filter-search-btn');

  searchBtn.addEventListener('click', render);

  searchInput.addEventListener('input', function () {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(render, 300);
  });

  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      clearTimeout(searchDebounce);
      render();
    }
  });

  Aero.el('refresh-btn').addEventListener('click', function () {
    render();
    Aero.toast('Account list refreshed.', 'info');
  });

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var button = target.closest('[data-action]');
    if (!button) return;

    var action = button.getAttribute('data-action');
    var result = Aero.reviewAccount(
      button.getAttribute('data-id'),
      action
    );

    if (!result.ok) {
      Aero.toast(result.message, 'error');
      return;
    }

    if (action === 'deactivate') {
      Aero.toast(result.user.fullName + ' has been deactivated.', 'success');
    } else if (result.user.status === 'active') {
      Aero.toast(result.user.fullName + ' approved and can now sign in.', 'success');
    } else {
      Aero.toast(result.user.fullName + ' was declined.', 'info');
    }
    render();
  });

  render();
});
