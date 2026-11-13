<?php
/**
 * OnWord server settings. Copy this file to config.php (same folder) and fill in the database you
 * created in your hosting control panel (DirectAdmin: Account Manager → MySQL Management).
 * The tables are created automatically the first time the site is opened.
 */
return [
    // MySQL / MariaDB. On DirectAdmin the database and user are usually named "<account>_<name>".
    'dsn' => 'mysql:host=localhost;dbname=ACCOUNT_onword;charset=utf8mb4',
    'db_user' => 'ACCOUNT_onword',
    'db_password' => 'CHANGE-ME',

    // Whether visitors may create their own account.
    'allow_registration' => true,
    // If set, a new account can only be created by someone who knows this code.
    'registration_code' => '',

    // Largest document the server stores, in bytes. Keep it below PHP's post_max_size and
    // MySQL's max_allowed_packet.
    'max_document_bytes' => 5 * 1024 * 1024,
];
