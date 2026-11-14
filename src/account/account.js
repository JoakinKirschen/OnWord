import { $, hit } from '../core/dom.js';
import { esc } from '../core/html.js';

const NEW_PASSWORD_LENGTH = 10; // MIN_PASSWORD in api/lib/auth.php
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
 * @property {import('../core/api.js').Session} session what the server offers: registration (and whether it
 *   needs a code), the password form, single sign-on providers, and why the last sign-on failed
 * @property {(user: import('../core/api.js').User) => void} onSignedIn
 *
 * @param {AccountDeps} deps
 */
export function createAccount({ root, api, session, onSignedIn }) {
  const registration = session.registration ?? { open: false, code: false };
  const passwords = session.passwords !== false;
  const providers = session.sso ?? [];
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
    $('#accountAlt', root).hidden = !registration.open || !passwords;
    for (const el of form.querySelectorAll('[data-only]')) {
      const wanted = el.dataset.only === 'register' ? mode === 'register' : mode === 'register' && registration.code;
      el.hidden = !wanted;
      $('input', el).disabled = !wanted; // disabled fields are neither required nor submitted
    }
    field('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    // The server has the final word; an account made under older rules can still sign in.
    field('password').minLength = mode === 'register' ? NEW_PASSWORD_LENGTH : 0;
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
      // Single sign-on leaves the page for the provider's, so these are links, not requests.
      $('#accountSso', root).innerHTML = providers
        .map(
          (p) =>
            `<a class="btn sso-btn" href="api/index.php?r=auth/sso&amp;provider=${encodeURIComponent(p.id)}">Sign in with ${esc(p.label)}</a>`,
        )
        .join('');
      $('#accountSso', root).hidden = !providers.length;
      $('#accountOr', root).hidden = !providers.length || !passwords;
      form.hidden = !passwords;
      show('login');
      message.textContent = session.ssoError ?? '';
      if (!form.hidden) field('email').focus();
    },
  };
}
