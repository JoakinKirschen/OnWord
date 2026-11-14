<?php
declare(strict_types=1);

/** Accounts: registering, signing in and out, and who the current user is. */

const MIN_PASSWORD = 10;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores whatever comes after
// Failed sign-ins are limited per address and connection, so nobody can lock someone else out by
// guessing their password, and per connection, so one machine cannot try address after address.
const MAX_FAILED_PER_ACCOUNT = 8;
const MAX_FAILED_PER_CONNECTION = 30;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
/** Stands in for the address in login_attempts for an attempt to create an account; never a real address. */
const REGISTER_KEY = '(register)';
/** Checked against when an address has no account, so that answer takes as long as a wrong password. */
const DUMMY_HASH = '$2y$10$1f66zacYk7KADoZTQkTyy.NsFvkOkgXhV.ygy1IPjZz0VGaPD0KD2';
/** Passwords of the required length that are guessed first; anything containing these words too. */
const COMMON_PASSWORDS = [
    '1234567890', '0987654321', '12345678910', '123456789a', 'a123456789', 'abc1234567', 'abcd123456',
    'qwertyuiop', '1q2w3e4r5t', '1qaz2wsx3edc', 'qazwsxedc1', 'asdfghjkl1', 'zxcvbnm123', 'abcdefghij',
    'iloveyou12', 'welcome123', 'welcome1234', 'letmein123', 'football12', 'baseball12', 'sunshine12',
    'princess12', 'dragon1234', 'monkey1234', 'superman12', 'trustno1234', 'administrator', 'changeme123',
    'default123', 'computer12', 'internet12', 'summer2025', 'winter2025', 'onword1234',
];
const COMMON_WORDS = ['password', 'passw0rd', 'wachtwoord', 'motdepasse', 'qwerty', '123456'];

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
        // Whether the AI reader for contractors' offers is set up (an API key is configured).
        'ai' => $config['anthropic_api_key'] !== '',
    ];
}

/** Why a password will not do, or null when it will. */
function password_problem(string $password, string $email, string $name): ?string
{
    $lower = mb_strtolower($password);
    $local = strtolower(strstr($email, '@', true) ?: '');
    $guessable = in_array($lower, COMMON_PASSWORDS, true)
        || array_filter(COMMON_WORDS, fn ($word) => str_contains($lower, $word))
        || count(array_unique(mb_str_split($lower))) < 4
        || (strlen($local) >= 4 && str_contains($lower, $local))
        || (mb_strlen($name) >= 4 && str_contains($lower, mb_strtolower($name)));
    return match (true) {
        mb_strlen($password) < MIN_PASSWORD => 'Use a password of at least ' . MIN_PASSWORD . ' characters.',
        strlen($password) > MAX_PASSWORD_BYTES => 'Use a password of at most ' . MAX_PASSWORD_BYTES . ' characters.',
        (bool) $guessable => 'This password is too easy to guess. Avoid common words, your name and your email address.',
        default => null,
    };
}

/** How many attempts in `login_attempts` match, within the last `$windowMs`. */
function recent_attempts(PDO $db, string $where, array $params, int $windowMs): int
{
    $sql = "SELECT COUNT(*) FROM login_attempts WHERE at >= ? AND $where";
    return (int) run($db, $sql, [now_ms() - $windowMs, ...$params])->fetchColumn();
}

function record_attempt(PDO $db, string $email, string $ip): void
{
    run($db, 'DELETE FROM login_attempts WHERE at < ?', [now_ms() - max(LOGIN_WINDOW_MS, REGISTER_WINDOW_MS)]);
    run($db, 'INSERT INTO login_attempts (email, ip, at) VALUES (?, ?, ?)', [$email, $ip, now_ms()]);
}

function auth_register(PDO $db, ?array $user, array $in, array $config): array
{
    if (!$config['allow_registration']) {
        fail(403, 'registration_closed', 'New accounts cannot be created on this site.');
    }
    // Every attempt counts, so a registration code cannot be found by trying.
    $ip = client_ip($config);
    if (recent_attempts($db, 'email = ? AND ip = ?', [REGISTER_KEY, $ip], REGISTER_WINDOW_MS) >= $config['max_registrations_per_hour']) {
        fail(429, 'too_many_attempts', 'Too many attempts to create an account from this connection. Try again later.');
    }
    record_attempt($db, REGISTER_KEY, $ip);
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
    $problem = is_string($password) ? password_problem($password, $email, $name) : 'Enter a password.';
    if ($problem) {
        fail(400, 'weak_password', $problem);
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
    $ip = client_ip($config);
    if (
        recent_attempts($db, 'email = ? AND ip = ?', [$email, $ip], LOGIN_WINDOW_MS) >= MAX_FAILED_PER_ACCOUNT
        || recent_attempts($db, 'ip = ? AND email <> ?', [$ip, REGISTER_KEY], LOGIN_WINDOW_MS) >= MAX_FAILED_PER_CONNECTION
    ) {
        fail(429, 'too_many_attempts', 'Too many failed attempts. Try again in a few minutes.');
    }
    $row = run($db, 'SELECT id, email, name, password_hash FROM users WHERE email = ?', [$email])->fetch();
    // An address without an account is checked against a stand-in, so the answer comes just as fast.
    $valid = password_verify($password, $row ? $row['password_hash'] : DUMMY_HASH) && $row;
    if (!$valid) {
        record_attempt($db, $email, $ip);
        fail(401, 'bad_credentials', 'The email address or password is not correct.');
    }
    run($db, 'DELETE FROM login_attempts WHERE email = ? AND ip = ?', [$email, $ip]);
    if (password_needs_rehash($row['password_hash'], PASSWORD_DEFAULT)) {
        run($db, 'UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $row['id']]);
    }
    return sign_in($row);
}

function auth_logout(PDO $db, ?array $user, array $in, array $config): array
{
    $_SESSION = [];
    session_regenerate_id(true);
    $_SESSION['csrf'] = bin2hex(random_bytes(16));
    return ['user' => null, 'csrf' => $_SESSION['csrf']];
}
