<?php
declare(strict_types=1);

/**
 * Where single sign-on providers send the browser back. Its own address because providers do not accept
 * a query string in it; everything else happens in index.php.
 */

$_GET['r'] = 'auth/sso/callback';
require __DIR__ . '/index.php';
