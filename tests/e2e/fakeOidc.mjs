/**
 * A stand-in for an OpenID Connect provider (Microsoft Entra ID, Google…), so single sign-on is tested
 * without accounts or network. It serves any number of issuers under one address (`<url>/<name>`), signs
 * ID tokens with a real RSA key, and plays the user through `fake.user`: who signs in on the provider's
 * page next, or null for someone who cancels.
 */
import { createHash, createSign, generateKeyPairSync } from 'node:crypto';
import { createServer } from 'node:http';

const base64url = (data) => Buffer.from(data).toString('base64url');

export function fakeOidc() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey; // for forged tokens
  const codes = new Map();
  const fake = {
    url: '',
    server: null,
    /** @type {{ sub: string, email: string, name?: string, email_verified?: boolean } | null} */
    user: null,
    /** Sign the next token with a key the provider does not publish. */
    forge: false,
  };

  function idToken(claims) {
    const head = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'key-1' }));
    const body = base64url(JSON.stringify(claims));
    const signature = createSign('RSA-SHA256')
      .update(`${head}.${body}`)
      .sign(fake.forge ? other : privateKey);
    return `${head}.${body}.${base64url(signature)}`;
  }

  /** Answers one request for the issuer at `issuer`, `path` being what follows it. */
  function answer(issuer, path, params, res) {
    const json = (status, data) =>
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(data));
    if (path === '/.well-known/openid-configuration') {
      return json(200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/keys`,
      });
    }
    if (path === '/keys')
      return json(200, { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'key-1', use: 'sig' }] });
    if (path === '/authorize') {
      const back = new URL(params.get('redirect_uri'));
      back.searchParams.set('state', params.get('state'));
      if (!fake.user) back.searchParams.set('error', 'access_denied');
      else {
        const code = Math.random().toString(36).slice(2);
        codes.set(code, { user: fake.user, issuer, params: Object.fromEntries(params) });
        back.searchParams.set('code', code);
      }
      return res.writeHead(302, { Location: back.href }).end();
    }
    if (path === '/token') {
      const grant = codes.get(params.get('code'));
      codes.delete(params.get('code'));
      const challenge = createHash('sha256')
        .update(params.get('code_verifier') ?? '')
        .digest('base64url');
      if (
        !grant ||
        grant.issuer !== issuer ||
        challenge !== grant.params.code_challenge ||
        params.get('client_secret') !== 'test-secret'
      )
        return json(400, { error: 'invalid_grant' });
      const now = Math.floor(Date.now() / 1000);
      const { email_verified = true, ...user } = grant.user;
      return json(200, {
        id_token: idToken({
          iss: issuer,
          aud: grant.params.client_id,
          iat: now,
          exp: now + 600,
          nonce: grant.params.nonce,
          email_verified,
          ...user,
        }),
      });
    }
    return json(404, { error: 'not_found' });
  }

  fake.server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const url = new URL(req.url, fake.url);
      const [, name, ...rest] = url.pathname.split('/');
      const params = req.method === 'POST' ? new URLSearchParams(body) : url.searchParams;
      answer(`${fake.url}/${name}`, '/' + rest.join('/'), params, res);
    });
  });
  return new Promise((done) =>
    fake.server.listen(0, '127.0.0.1', () => {
      fake.url = `http://127.0.0.1:${fake.server.address().port}`;
      done(fake);
    }),
  );
}
