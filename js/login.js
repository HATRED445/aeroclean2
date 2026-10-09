Aero.onReady(function () {
  'use strict';

  if (Aero.redirectIfSignedIn()) return;

  var form = Aero.el('login-form');
  var alertBox = Aero.el('login-alert');

  // Password toggle
  var passwordToggle = document.querySelector('.password-toggle');
  var passwordInput = Aero.el('password');
  if (passwordToggle && passwordInput) {
    passwordToggle.addEventListener('click', function () {
      var show = passwordInput.type === 'password';
      passwordInput.type = show ? 'text' : 'password';
      passwordToggle.setAttribute('aria-pressed', show);
      var eyeOpen = passwordToggle.querySelector('.eye-open');
      var eyeClosed = passwordToggle.querySelector('.eye-closed');
      if (eyeOpen) eyeOpen.hidden = show;
      if (eyeClosed) eyeClosed.hidden = !show;
    });
  }

  // Guest login
  var guestBtn = Aero.el('guest-login-btn');
  if (guestBtn) {
    guestBtn.addEventListener('click', function () {
      Aero.setAlert(alertBox, '');
      var result = Aero.authenticate('GUEST001', 'guest123');
      if (!result.ok) {
        // Try to create guest account if it doesn't exist
        var regResult = Aero.register({
          schoolId: 'GUEST001',
          password: 'guest123',
          fullName: 'Guest',
          email: '',
          phone: '',
          role: 'student'
        });
        if (regResult.ok) {
          result = Aero.authenticate('GUEST001', 'guest123');
        }
      }
      if (!result.ok) {
        Aero.setAlert(alertBox, result.message || 'Guest login failed', 'error');
        return;
      }
      if (result.user.fullName === 'Guest Student') {
        var users = JSON.parse(localStorage.getItem('aeroclean.users') || '[]');
        var idx = users.findIndex(function (u) { return u.schoolId === 'GUEST001'; });
        if (idx !== -1) {
          users[idx].fullName = 'Guest';
          localStorage.setItem('aeroclean.users', JSON.stringify(users));
          result.user.fullName = 'Guest';
        }
      }
      Aero.login(result.user);
      window.location.href = Aero.homeFor(result.user.role);
    });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    Aero.clearErrors(form);
    Aero.setAlert(alertBox, '');

    var result = Aero.authenticate(
      Aero.el('schoolId').value,
      Aero.el('password').value
    );

    if (!result.ok) {
      if (result.code === 'PENDING') {
        Aero.setPendingUser(result.pendingUserId);
        Aero.toast(result.message, 'info');
        window.location.href = 'pending.html';
        return;
      }
      Aero.showErrors(form, result.errors);
      Aero.setAlert(alertBox, result.message, 'error');
      return;
    }

    Aero.login(result.user);
    window.location.href = Aero.homeFor(result.user.role);
  });
});
