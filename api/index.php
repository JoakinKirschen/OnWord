<?php
declare(strict_types=1);

/**
 * OnWord server API: accounts and document storage. One entry point; the route is the `r` query
 * parameter (for example `api/index.php?r=docs/list`), so no URL rewriting is needed on the host.
 * Reads are GET, everything that changes data is POST with a JSON body and a CSRF token.
 */

require __DIR__ . '/lib/http.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/documents.php';
require __DIR__ . '/lib/specs.php';
require __DIR__ . '/lib/prices.php';

/** "METHOD route" => [handler, must be signed in]. */
const ROUTES = [
    'GET auth/me' => ['auth_me', false],
    'POST auth/register' => ['auth_register', false],
    'POST auth/login' => ['auth_login', false],
    'POST auth/logout' => ['auth_logout', false],
    'GET docs/list' => ['docs_list', true],
    'GET docs/get' => ['docs_get', true],
    'POST docs/create' => ['docs_create', true],
    'POST docs/update' => ['docs_update', true],
    'POST docs/copy' => ['docs_copy', true],
    'POST docs/delete' => ['docs_delete', true],
    'POST versions/add' => ['versions_add', true],
    'GET shares/list' => ['shares_list', true],
    'POST shares/add' => ['shares_add', true],
    'POST shares/remove' => ['shares_remove', true],
    'GET specs/list' => ['specs_list', true],
    'GET specs/get' => ['specs_get', true],
    'POST specs/create' => ['specs_create', true],
    'POST specs/update' => ['specs_update', true],
    'POST specs/delete' => ['specs_delete', true],
    'POST articles/save' => ['articles_save', true],
    'POST articles/delete' => ['articles_delete', true],
    'GET prices/list' => ['prices_list', true],
];

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $route = ROUTES[$method . ' ' . ($_GET['r'] ?? '')] ?? null;
    if (!$route) {
        fail(404, 'not_found', 'There is no such API route.');
    }
    [$handler, $signedIn] = $route;
    $config = load_config();
    start_session();
    if ($method === 'POST') {
        require_csrf();
    }
    $db = connect($config);
    $user = current_user($db);
    if ($signedIn && !$user) {
        fail(401, 'signed_out', 'Sign in to continue.');
    }
    respond($handler($db, $user, $method === 'POST' ? input() : [], $config));
} catch (Throwable $error) {
    // Details go to the server log, never to the browser.
    error_log('OnWord API: ' . $error->getMessage() . ' in ' . $error->getFile() . ':' . $error->getLine());
    fail(500, 'server_error', 'Something went wrong on the server.');
}
