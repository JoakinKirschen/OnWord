<?php
declare(strict_types=1);

/**
 * Single sign-on with OpenID Connect providers such as Microsoft 365 (Entra ID) and Google: the
 * authorization code flow with PKCE, a nonce, and the ID token's signature checked against the
 * provider's published keys. Providers are listed in config.php under 'sso'.
 */

const SSO_ID_PATTERN = '/^[a-z0-9-]{1,30}$/';
const SSO_PENDING_MS = 10 * 60 * 1000; // how long a started sign-in may take
const SSO_CLOCK_SKEW = 300; // seconds of difference allowed between our clock and the provider's
const SSO_TIMEOUT = 15; // seconds per request to the provider
const SSO_LOCAL_HOSTS = ['127.0.0.1', 'localhost']; // where plain http is allowed: tests and development
// SubjectPublicKeyInfo header for an RSA key: SEQUENCE { OID rsaEncryption, NULL }.
const RSA_ALGORITHM = "\x30\x0d\x06\x09\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01\x05\x00";

/** The providers in the configuration that are complete, by id. */
function sso_providers(array $config): array
{
    $providers = [];
    foreach (is_array($config['sso'] ?? null) ? $config['sso'] : [] as $p) {
        $issuer = is_array($p) ? (string) ($p['issuer'] ?? '') : '';
        $scheme = parse_url($issuer, PHP_URL_SCHEME);
        $secure = $scheme === 'https' || ($scheme === 'http' && in_array(parse_url($issuer, PHP_URL_HOST), SSO_LOCAL_HOSTS, true));
        if ($secure && preg_match(SSO_ID_PATTERN, (string) ($p['id'] ?? '')) && !empty($p['client_id']) && !empty($p['client_secret'])) {
            $providers[$p['id']] = $p + ['label' => $p['id'], 'domains' => []];
        }
    }
    return $providers;
}

/** What the sign-in screen offers: the providers' ids and labels. */
function sso_public(array $config): array
{
    return array_values(array_map(fn ($p) => ['id' => $p['id'], 'label' => (string) $p['label']], sso_providers($config)));
}

function base64url_encode(string $bytes): string
{
    return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
}

function base64url_decode(string $text): string
{
    return (string) base64_decode(strtr($text, '-_', '+/'), true);
}

/** A JSON request to the provider: GET, or POST with a form. Any failure ends the sign-in. */
function sso_fetch(string $url, ?array $form = null): array
{
    if (!function_exists('curl_init')) {
        throw new RuntimeException('PHP has no curl extension');
    }
    $curl = curl_init($url);
    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => SSO_TIMEOUT,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ] + ($form === null ? [] : [CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query($form)]));
    $raw = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    curl_close($curl);
    $data = is_string($raw) ? json_decode($raw, true) : null;
    if ($status !== 200 || !is_array($data)) {
        throw new RuntimeException("Sign-in provider answered $status for $url");
    }
    return $data;
}

/** The provider's endpoints, from its discovery document, which must name the configured issuer. */
function sso_discover(array $provider): array
{
    $doc = sso_fetch(rtrim($provider['issuer'], '/') . '/.well-known/openid-configuration');
    foreach (['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri'] as $key) {
        if (!is_string($doc[$key] ?? null)) {
            throw new RuntimeException("Discovery document without $key");
        }
    }
    if (rtrim($doc['issuer'], '/') !== rtrim($provider['issuer'], '/')) {
        throw new RuntimeException('Discovery document for another issuer');
    }
    return $doc;
}

/** Where the provider sends the browser back: api/sso.php, since providers refuse query strings there. */
function sso_redirect_uri(array $config): string
{
    $base = $config['site_url'] ?: (is_https() ? 'https://' : 'http://') . ($_SERVER['HTTP_HOST'] ?? 'localhost')
        . rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php')), '/');
    return rtrim($base, '/') . '/api/sso.php';
}

/** Back to the app, which shows `$_SESSION['sso_error']` if something went wrong. */
function sso_back_to_app(?string $error = null): never
{
    if ($error !== null) {
        $_SESSION['sso_error'] = $error;
    }
    redirect(rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php')), '/') . '/#/');
}

/** GET auth/sso&provider=…: sends the browser to the provider's sign-in page. */
function auth_sso_start(PDO $db, ?array $user, array $in, array $config): array
{
    $provider = sso_providers($config)[$_GET['provider'] ?? ''] ?? null;
    if (!$provider) {
        fail(404, 'not_found', 'There is no such sign-in provider.');
    }
    try {
        $endpoints = sso_discover($provider);
    } catch (Throwable $e) {
        error_log('OnWord sign-on: ' . $e->getMessage());
        sso_back_to_app("{$provider['label']} could not be reached. Try again later.");
    }
    $verifier = base64url_encode(random_bytes(32));
    $_SESSION['sso'] = [
        'provider' => $provider['id'],
        'state' => bin2hex(random_bytes(16)),
        'nonce' => bin2hex(random_bytes(16)),
        'verifier' => $verifier,
        'at' => now_ms(),
    ];
    redirect($endpoints['authorization_endpoint'] . (str_contains($endpoints['authorization_endpoint'], '?') ? '&' : '?') . http_build_query([
        'client_id' => $provider['client_id'],
        'response_type' => 'code',
        'redirect_uri' => sso_redirect_uri($config),
        'scope' => 'openid email profile',
        'state' => $_SESSION['sso']['state'],
        'nonce' => $_SESSION['sso']['nonce'],
        'code_challenge' => base64url_encode(hash('sha256', $verifier, true)),
        'code_challenge_method' => 'S256',
        'prompt' => 'select_account',
    ]));
}

/** A DER length, then a DER INTEGER for an unsigned big-endian number. */
function der_length(int $n): string
{
    if ($n < 0x80) {
        return chr($n);
    }
    $bytes = ltrim(pack('N', $n), "\0");
    return chr(0x80 | strlen($bytes)) . $bytes;
}

function der_integer(string $bytes): string
{
    $bytes = ord($bytes[0] ?? "\0") > 0x7f ? "\0" . $bytes : $bytes;
    return "\x02" . der_length(strlen($bytes)) . $bytes;
}

/** A JSON Web Key (RSA) as a PEM public key that openssl can use. */
function rsa_pem(array $jwk): string
{
    $numbers = der_integer(base64url_decode((string) $jwk['n'])) . der_integer(base64url_decode((string) $jwk['e']));
    $key = "\x30" . der_length(strlen($numbers)) . $numbers;
    $bits = "\x03" . der_length(strlen($key) + 1) . "\0" . $key;
    $info = RSA_ALGORITHM . $bits;
    $der = "\x30" . der_length(strlen($info)) . $info;
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}

/** The claims of an ID token, once its signature, issuer, audience, time and nonce are right. */
function sso_claims(string $token, array $endpoints, array $provider, string $nonce): array
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        throw new RuntimeException('Not a JSON Web Token');
    }
    [$head, $body, $signature] = $parts;
    $header = json_decode(base64url_decode($head), true);
    $claims = json_decode(base64url_decode($body), true);
    if (!is_array($header) || !is_array($claims) || ($header['alg'] ?? '') !== 'RS256') {
        throw new RuntimeException('Unexpected token format or algorithm');
    }
    $keys = sso_fetch($endpoints['jwks_uri'])['keys'] ?? [];
    $jwk = current(array_filter($keys, fn ($k) => is_array($k) && ($k['kid'] ?? null) === ($header['kid'] ?? null) && ($k['kty'] ?? '') === 'RSA'));
    if (!$jwk || openssl_verify("$head.$body", base64url_decode($signature), rsa_pem($jwk), OPENSSL_ALGO_SHA256) !== 1) {
        throw new RuntimeException('Token signature does not verify');
    }
    // Google writes its issuer with or without the scheme.
    $issuer = rtrim((string) ($claims['iss'] ?? ''), '/');
    $audience = (array) ($claims['aud'] ?? []);
    $now = time();
    if (
        !in_array(rtrim($endpoints['issuer'], '/'), [$issuer, "https://$issuer"], true)
        || !in_array($provider['client_id'], $audience, true)
        || (int) ($claims['exp'] ?? 0) < $now - SSO_CLOCK_SKEW
        || (int) ($claims['iat'] ?? 0) > $now + SSO_CLOCK_SKEW
        || !hash_equals($nonce, (string) ($claims['nonce'] ?? ''))
        || !is_string($claims['sub'] ?? null) || $claims['sub'] === ''
    ) {
        throw new RuntimeException('Token claims do not match this sign-in');
    }
    return $claims;
}

/** The address a provider vouches for: `email`, or Microsoft's `preferred_username`; null when unverified. */
function sso_email(array $claims): ?string
{
    if (($claims['email_verified'] ?? true) === false) {
        return null;
    }
    $email = strtolower(trim((string) ($claims['email'] ?? $claims['preferred_username'] ?? '')));
    return filter_var($email, FILTER_VALIDATE_EMAIL) && strlen($email) <= 190 ? $email : null;
}

/**
 * The account for a provider's user: by their subject, else by their address (linking it), else a new
 * one where the provider's domains or open registration allow it. Null when they may not sign in.
 */
function sso_account(PDO $db, array $provider, array $claims, string $email, array $config): ?array
{
    $subject = mb_substr($provider['issuer'] . '|' . $claims['sub'], 0, 255);
    $row = run($db, 'SELECT id, email, name FROM users WHERE sso_subject = ?', [$subject])->fetch()
        ?: run($db, 'SELECT id, email, name, sso_subject FROM users WHERE email = ?', [$email])->fetch();
    if ($row) {
        if (array_key_exists('sso_subject', $row) && $row['sso_subject'] === null) {
            run($db, 'UPDATE users SET sso_subject = ? WHERE id = ?', [$subject, $row['id']]);
        }
        return $row;
    }
    $open = $provider['domains'] || ($config['allow_registration'] && $config['registration_code'] === '');
    if (!$open) {
        return null;
    }
    $name = mb_substr(trim((string) ($claims['name'] ?? '')) ?: strstr($email, '@', true), 0, 100);
    run($db, 'INSERT INTO users (email, name, password_hash, sso_subject, created_at) VALUES (?, ?, ?, ?, ?)', [
        $email, $name, '', $subject, now_ms(), // no password: this account signs in with the provider only
    ]);
    return run($db, 'SELECT id, email, name FROM users WHERE email = ?', [$email])->fetch();
}

/** GET api/sso.php: the provider sends the browser back here with a code to exchange for an ID token. */
function auth_sso_callback(PDO $db, ?array $user, array $in, array $config): array
{
    $pending = $_SESSION['sso'] ?? null;
    unset($_SESSION['sso']); // a sign-in can be completed once
    $provider = is_array($pending) ? (sso_providers($config)[$pending['provider']] ?? null) : null;
    if (!$provider || now_ms() - $pending['at'] > SSO_PENDING_MS || !hash_equals($pending['state'], (string) ($_GET['state'] ?? ''))) {
        sso_back_to_app('This sign-in was not started here or took too long. Try again.');
    }
    if (isset($_GET['error']) || !is_string($_GET['code'] ?? null)) {
        sso_back_to_app("Signing in with {$provider['label']} was cancelled or refused.");
    }
    try {
        $endpoints = sso_discover($provider);
        $tokens = sso_fetch($endpoints['token_endpoint'], [
            'grant_type' => 'authorization_code',
            'code' => $_GET['code'],
            'redirect_uri' => sso_redirect_uri($config),
            'client_id' => $provider['client_id'],
            'client_secret' => $provider['client_secret'],
            'code_verifier' => $pending['verifier'],
        ]);
        $claims = sso_claims((string) ($tokens['id_token'] ?? ''), $endpoints, $provider, $pending['nonce']);
    } catch (Throwable $e) {
        error_log('OnWord sign-on: ' . $e->getMessage());
        sso_back_to_app("Signing in with {$provider['label']} did not work. Try again.");
    }
    $email = sso_email($claims);
    $domain = $email ? substr(strrchr($email, '@'), 1) : '';
    $domains = array_map('strtolower', (array) $provider['domains']);
    if (!$email || ($domains && !in_array($domain, $domains, true))) {
        sso_back_to_app("This {$provider['label']} account may not sign in here. Use your work account.");
    }
    $row = sso_account($db, $provider, $claims, $email, $config);
    if (!$row) {
        sso_back_to_app('There is no account for ' . $email . ' on this site, and new accounts cannot be created here.');
    }
    sign_in($row);
    sso_back_to_app();
}
