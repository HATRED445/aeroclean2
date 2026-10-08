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
