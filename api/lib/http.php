<?php
declare(strict_types=1);

/** Request and response plumbing: JSON in and out, errors, the session and CSRF protection. */

const SESSION_NAME = 'onword';
const CSRF_HEADER = 'HTTP_X_CSRF_TOKEN';

/** Sends a JSON response and ends the request. */
function respond(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Ends the request with an error. `$code` is a stable identifier the client can act on. */
function fail(int $status, string $code, string $message = ''): never
{
    respond(['error' => $code, 'message' => $message], $status);
}

/** The JSON body of the request as an array (empty when there is none). */
function input(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) {
        return [];
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        fail(400, 'bad_request', 'The request body must be JSON.');
    }
    return $data;
}

/** A required string field, trimmed, with a maximum length. */
function text_field(array $in, string $name, int $max, bool $required = true): string
{
    $value = $in[$name] ?? '';
    if (!is_string($value)) {
        fail(400, 'bad_request', "Field '$name' must be text.");
    }
    $value = trim($value);
    if ($required && $value === '') {
        fail(400, 'bad_request', "Field '$name' is required.");
    }
    if (mb_strlen($value) > $max) {
        fail(400, 'bad_request', "Field '$name' is too long.");
    }
    return $value;
}

function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

/** Starts the session with a cookie scripts cannot read and other sites cannot send. */
function start_session(): void
{
    session_name(SESSION_NAME);
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
}

/** Every request that changes something must carry the token handed out by `auth/me`. */
function require_csrf(): void
{
    $sent = $_SERVER[CSRF_HEADER] ?? '';
    if (!is_string($sent) || !hash_equals($_SESSION['csrf'], $sent)) {
        fail(403, 'csrf', 'The security token is missing or out of date.');
    }
}

/**
 * The visitor's IP address. Behind a proxy or CDN every request comes from the proxy, so the address is
 * taken from the header it names (`client_ip_header`, e.g. HTTP_CF_CONNECTING_IP for Cloudflare): only
 * set that when the site is reachable through that proxy alone, or anyone could claim any address.
 */
function client_ip(array $config): string
{
    $header = $config['client_ip_header'];
    $forwarded = $header ? trim(explode(',', (string) ($_SERVER[$header] ?? ''))[0]) : '';
    $ip = filter_var($forwarded, FILTER_VALIDATE_IP) ? $forwarded : ($_SERVER['REMOTE_ADDR'] ?? '');
    return substr((string) $ip, 0, 45);
}

/** Milliseconds since the epoch, the unit the browser uses for dates. */
function now_ms(): int
{
    return (int) floor(microtime(true) * 1000);
}
