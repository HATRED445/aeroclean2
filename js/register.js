Aero.onReady(function () {
  'use strict';

  if (Aero.redirectIfSignedIn()) return;

  var form = Aero.el('register-form');
  var alertBox = Aero.el('register-alert');
  var roleInput = Aero.el('role');
  var roleButtons = document.querySelectorAll('.role-btn');

  var emailField = Aero.el('email-field');
  var phoneField = Aero.el('phone-field');
  var emailInput = Aero.el('email');
  var phoneInput = Aero.el('phone');

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

  // Personnel is the only option, show email/phone fields
  emailField.hidden = false;
  phoneField.hidden = false;
  emailInput.disabled = false;
  phoneInput.disabled = false;

  var note = Aero.el('register-alert');
  Aero.setAlert(
    note,
    'Personnel accounts are reviewed and approved by an administrator before sign-in.',
    'info'
  );

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    Aero.clearErrors(form);
    Aero.setAlert(alertBox, '');

    var result = Aero.register({
      schoolId: Aero.el('schoolId').value,
      password: Aero.el('password').value,
      fullName: Aero.el('fullName').value,
      email: Aero.el('email').value,
      phone: Aero.el('phone').value,
      role: roleInput.value
    });

    if (!result.ok) {
      Aero.showErrors(form, result.errors);
      Aero.setAlert(alertBox, result.message, 'error');
      return;
    }

    if (result.status === 'pending') {
      Aero.setPendingUser(result.user.id);
    }

    Aero.el('register-view').hidden = true;
    Aero.el('register-success').hidden = false;
    Aero.el('success-title').textContent =
      result.status === 'pending' ? 'Registration submitted' : 'Account created';
    Aero.el('success-message').textContent = result.message;
    Aero.el('success-secondary').hidden = result.status !== 'pending';
    Aero.toast(result.message, 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});
