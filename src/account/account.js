import { $, hit } from '../core/dom.js';

const MODES = {
  login: { title: 'Sign in', submit: 'Sign in', route: 'auth/login', other: 'Create an account', prompt: 'New here?' },
  register: {
    title: 'Create your account',
    submit: 'Create account',
    route: 'auth/register',
    other: 'Sign in',
    prompt: 'Already have an account?',
  },
};

/**
 * The sign-in screen, shown when the site has a server and nobody is signed in.
 * @typedef {object} AccountDeps
 * @property {HTMLElement} root
 * @property {import('../core/api.js').Api} api
 * @property {{ open: boolean, code: boolean }} registration whether accounts can be created, and need a code
 * @property {(user: import('../core/api.js').User) => void} onSignedIn
 *
 * @param {AccountDeps} deps
 */
export function createAccount({ root, api, registration, onSignedIn }) {
  const form = $('#accountForm', root),
    message = $('#accountError', root),
    submit = $('#accountSubmit', root);
  const field = (/** @type {string} */ name) => $(`[name="${name}"]`, form);
  /** @type {'login' | 'register'} */
  let mode = 'login';

  function show(/** @type {'login' | 'register'} */ next) {
    mode = next;
    const texts = MODES[mode];
    $('#accountTitle', root).textContent = texts.title;
    submit.textContent = texts.submit;
    $('#accountPrompt', root).textContent = texts.prompt;
    $('#accountSwitch', root).textContent = texts.other;
    $('#accountAlt', root).hidden = !registration.open;
    for (const el of form.querySelectorAll('[data-only]')) {
      const wanted = el.dataset.only === 'register' ? mode === 'register' : mode === 'register' && registration.code;
      el.hidden = !wanted;
      $('input', el).disabled = !wanted; // disabled fields are neither required nor submitted
    }
    field('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    message.textContent = '';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    submit.disabled = true;
    message.textContent = '';
    try {
      const { user } = await api.post(MODES[mode].route, values);
      root.hidden = true;
      onSignedIn(user);
    } catch (err) {
      message.textContent = /** @type {Error} */ (err).message || 'That did not work. Try again.';
    } finally {
      submit.disabled = false;
    }
  });

  root.addEventListener('click', (e) => {
    if (hit(e, '#accountSwitch')) show(mode === 'login' ? 'register' : 'login');
  });

  return {
    show() {
      root.hidden = false;
      show('login');
      field('email').focus();
    },
  };
}
