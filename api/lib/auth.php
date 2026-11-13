<?php
declare(strict_types=1);

/** Accounts: registering, signing in and out, and who the current user is. */

const MIN_PASSWORD = 8;
const MAX_FAILED_LOGINS = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function public_user(array $row): array
{
    return ['id' => (int) $row['id'], 'email' => $row['email'], 'name' => $row['name']];
}

function current_user(PDO $db): ?array
{
    if (empty($_SESSION['user_id'])) {
        return null;
    }
    $row = run($db, 'SELECT id, email, name FROM users WHERE id = ?', [$_SESSION['user_id']])->fetch();
    return $row ? public_user($row) : null;
}

function sign_in(array $row): array
{
    session_regenerate_id(true); // a fresh session id for the signed-in user
    $_SESSION['user_id'] = (int) $row['id'];
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
    return ['user' => public_user($row), 'csrf' => $_SESSION['csrf']];
}

function auth_me(PDO $db, ?array $user, array $in, array $config): array
{
    return [
        'user' => $user,
        'csrf' => $_SESSION['csrf'],
        'registration' => [
            'open' => (bool) $config['allow_registration'],
            'code' => $config['registration_code'] !== '',
        ],
    ];
}

function auth_register(PDO $db, ?array $user, array $in, array $config): array
{
    if (!$config['allow_registration']) {
        fail(403, 'registration_closed', 'New accounts cannot be created on this site.');
    }
    $expected = (string) $config['registration_code'];
    if ($expected !== '' && !hash_equals($expected, text_field($in, 'code', 200, false))) {
        fail(403, 'wrong_code', 'The registration code is not correct.');
    }
    $email = strtolower(text_field($in, 'email', 190));
    $name = text_field($in, 'name', 100);
    $password = $in['password'] ?? '';
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        fail(400, 'bad_email', 'Enter a valid email address.');
    }
    if (!is_string($password) || strlen($password) < MIN_PASSWORD) {
        fail(400, 'weak_password', 'Use a password of at least ' . MIN_PASSWORD . ' characters.');
    }
    if (run($db, 'SELECT 1 FROM users WHERE email = ?', [$email])->fetch()) {
        fail(409, 'email_taken', 'There is already an account with this email address.');
    }
    run($db, 'INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)', [
        $email, $name, password_hash($password, PASSWORD_DEFAULT), now_ms(),
    ]);
    return sign_in(run($db, 'SELECT id, email, name FROM users WHERE email = ?', [$email])->fetch());
}

function auth_login(PDO $db, ?array $user, array $in, array $config): array
{
    $email = strtolower(text_field($in, 'email', 190));
    $password = is_string($in['password'] ?? null) ? $in['password'] : '';
    $since = now_ms() - LOGIN_WINDOW_MS;
    run($db, 'DELETE FROM login_attempts WHERE at < ?', [$since]);
    $failed = run($db, 'SELECT COUNT(*) FROM login_attempts WHERE email = ? OR ip = ?', [$email, client_ip()])->fetchColumn();
    if ((int) $failed >= MAX_FAILED_LOGINS) {
        fail(429, 'too_many_attempts', 'Too many failed attempts. Try again in a few minutes.');
    }
    $row = run($db, 'SELECT id, email, name, password_hash FROM users WHERE email = ?', [$email])->fetch();
    if (!$row || !password_verify($password, $row['password_hash'])) {
        run($db, 'INSERT INTO login_attempts (email, ip, at) VALUES (?, ?, ?)', [$email, client_ip(), now_ms()]);
        fail(401, 'bad_credentials', 'The email address or password is not correct.');
    }
    run($db, 'DELETE FROM login_attempts WHERE email = ?', [$email]);
    return sign_in($row);
}

function auth_logout(PDO $db, ?array $user, array $in, array $config): array
{
    $_SESSION = [];
    session_regenerate_id(true);
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
    return ['user' => null, 'csrf' => $_SESSION['csrf']];
}
