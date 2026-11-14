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
    // Attempts to create an account per connection (IP address) and hour; wrong codes count too.
    'max_registrations_per_hour' => 10,
    // Behind a proxy or CDN, the header that carries the visitor's address, e.g. 'HTTP_CF_CONNECTING_IP'
    // for Cloudflare. Leave empty when visitors reach the site directly.
    'client_ip_header' => '',

    // Largest document the server stores, in bytes. Keep it below PHP's post_max_size and
    // MySQL's max_allowed_packet.
    'max_document_bytes' => 5 * 1024 * 1024,
    // Largest photo of a site review, as sent by the browser (which shrinks photos before sending them).
    'max_photo_bytes' => 4 * 1024 * 1024,

    // The AI reader for contractors' offers (PDFs and unusual spreadsheets). Leave the key empty to turn
    // it off. With a key from console.anthropic.com, the offers people import are sent to Anthropic's
    // Claude API to be read. Needs PHP's curl extension; reading a long offer can take a few minutes, so
    // the host must allow requests that long.
    'anthropic_api_key' => '',
    // 'ai_model' => 'claude-opus-5-5',
    // 'ai_effort' => 'low', // low, medium, high: more is slower and costs more, but reads messier files
    // 'ai_max_file_bytes' => 10 * 1024 * 1024, // keep below PHP's post_max_size
];
