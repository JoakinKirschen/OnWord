<?php
declare(strict_types=1);

/** Database connection and schema. Works on MySQL/MariaDB (production) and SQLite (tests). */

const SCHEMA_VERSION = 3; // 2: specifications and their articles; 3: contractors' offers

function load_config(): array
{
    // ONWORD_CONFIG lets the test suite point at a temporary configuration.
    $path = getenv('ONWORD_CONFIG') ?: __DIR__ . '/../config.php';
    if (!is_file($path)) {
        fail(503, 'not_configured', 'Copy api/config.sample.php to api/config.php and fill in the database details.');
    }
    $config = require $path;
    return $config + [
        'db_user' => null,
        'db_password' => null,
        'allow_registration' => true,
        'registration_code' => '',
        'max_document_bytes' => 5 * 1024 * 1024,
        'anthropic_api_key' => '',
        'anthropic_base_url' => 'https://api.anthropic.com',
        'ai_model' => 'claude-opus-5-5',
        'ai_effort' => 'low',
        'ai_max_file_bytes' => 10 * 1024 * 1024,
    ];
}

function connect(array $config): PDO
{
    $db = new PDO($config['dsn'], $config['db_user'], $config['db_password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    ensure_schema($db);
    return $db;
}

/** Creates the tables on first use, so installing is only a matter of uploading and configuring. */
function ensure_schema(PDO $db): void
{
    try {
        $version = $db->query('SELECT version FROM schema_info')->fetchColumn();
        if ((int) $version === SCHEMA_VERSION) {
            return;
        }
    } catch (PDOException) {
        // The table does not exist yet: this is a fresh database.
    }
    $mysql = $db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
    $serial = $mysql ? 'INT NOT NULL AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $long = $mysql ? 'LONGTEXT' : 'TEXT';
    $options = $mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4' : '';
    $tables = [
        "CREATE TABLE IF NOT EXISTS schema_info (version INT NOT NULL)",
        "CREATE TABLE IF NOT EXISTS users (
            id $serial,
            email VARCHAR(190) NOT NULL UNIQUE,
            name VARCHAR(100) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            created_at BIGINT NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS documents (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            owner_id INT NOT NULL,
            title VARCHAR(200) NOT NULL,
            snippet TEXT NOT NULL,
            page TEXT NULL,
            html $long NOT NULL,
            rev INT NOT NULL DEFAULT 1,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS shares (
            doc_id VARCHAR(32) NOT NULL,
            user_id INT NOT NULL,
            role VARCHAR(8) NOT NULL,
            PRIMARY KEY (doc_id, user_id)
        )",
        "CREATE TABLE IF NOT EXISTS versions (
            id $serial,
            doc_id VARCHAR(32) NOT NULL,
            at BIGINT NOT NULL,
            snippet TEXT NOT NULL,
            html $long NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS specs (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            owner_id INT NOT NULL,
            kind VARCHAR(8) NOT NULL,
            title VARCHAR(200) NOT NULL,
            master_id VARCHAR(32) NULL,
            phase VARCHAR(100) NOT NULL,
            lot VARCHAR(100) NOT NULL,
            created_at BIGINT NOT NULL,
            updated_at BIGINT NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS articles (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            spec_id VARCHAR(32) NOT NULL,
            parent_id VARCHAR(32) NULL,
            number VARCHAR(60) NOT NULL,
            title VARCHAR(300) NOT NULL,
            unit VARCHAR(30) NOT NULL,
            html $long NOT NULL,
            source_id VARCHAR(32) NULL,
            line_data TEXT NOT NULL,
            price DOUBLE NOT NULL DEFAULT 0
        )",
        "CREATE TABLE IF NOT EXISTS offers (
            id VARCHAR(32) NOT NULL PRIMARY KEY,
            spec_id VARCHAR(32) NOT NULL,
            contractor VARCHAR(200) NOT NULL,
            created_at BIGINT NOT NULL,
            data $long NOT NULL
        )",
        "CREATE TABLE IF NOT EXISTS login_attempts (
            id $serial,
            email VARCHAR(190) NOT NULL,
            ip VARCHAR(45) NOT NULL,
            at BIGINT NOT NULL
        )",
    ];
    foreach ($tables as $sql) {
        $db->exec($sql . $options);
    }
    $db->exec('DELETE FROM schema_info');
    $db->prepare('INSERT INTO schema_info (version) VALUES (?)')->execute([SCHEMA_VERSION]);
}

/** Runs a prepared statement. Values never go into the SQL text itself. */
function run(PDO $db, string $sql, array $params = []): PDOStatement
{
    $statement = $db->prepare($sql);
    $statement->execute($params);
    return $statement;
}
