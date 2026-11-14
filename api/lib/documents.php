<?php
declare(strict_types=1);

/** Documents: listing, reading, creating, saving, copying, deleting and versions. Sharing is in shares.php. */

const MAX_VERSIONS = 10;
const MAX_SETTINGS_BYTES = 20000; // page setup and styles, each; a TEXT column holds 64 KB
const ID_PATTERN = '/^[a-z0-9]{8,32}$/';
const META = 'd.id, d.title, d.snippet, d.page, d.styles, d.template, d.project_id, d.rev, d.created_at, d.updated_at, d.owner_id';

function doc_id(array $in, string $field = 'id'): string
{
    $id = $in[$field] ?? '';
    if (!is_string($id) || !preg_match(ID_PATTERN, $id)) {
        fail(400, 'bad_request', 'That is not a valid document id.');
    }
    return $id;
}

/**
 * The metadata the client keeps for a document. `role` is owner, edit or view. Only the owner learns which
 * project it is filed under: projects are not shared, so to anyone else the id would point at nothing.
 */
function doc_meta(array $row, string $role, string $owner): array
{
    return [
        'id' => $row['id'],
        'title' => $row['title'],
        'snippet' => $row['snippet'],
        'page' => $row['page'] ? json_decode($row['page'], true) : null,
        'styles' => $row['styles'] ? json_decode($row['styles'], true) : null,
        'template' => (bool) $row['template'],
        'project' => $role === 'owner' ? $row['project_id'] : null,
        'rev' => (int) $row['rev'],
        'created' => (int) $row['created_at'],
        'updated' => (int) $row['updated_at'],
        'role' => $role,
        'owner' => $owner,
    ];
}

/**
 * The document and the user's role on it. A document the user may not see is reported exactly like
 * one that does not exist.
 */
function doc_access(PDO $db, array $user, string $id, bool $write = false): array
{
    $row = run($db, 'SELECT ' . META . ', u.name AS owner_name FROM documents d JOIN users u ON u.id = d.owner_id WHERE d.id = ?', [$id])->fetch();
    $role = null;
    if ($row && (int) $row['owner_id'] === $user['id']) {
        $role = 'owner';
    } elseif ($row) {
        $role = run($db, 'SELECT role FROM shares WHERE doc_id = ? AND user_id = ?', [$id, $user['id']])->fetchColumn() ?: null;
    }
    if (!$role) {
        fail(404, 'not_found', 'This document does not exist or is not shared with you.');
    }
    if ($write && $role === 'view') {
        fail(403, 'read_only', 'You can view this document but not change it.');
    }
    return ['row' => $row, 'role' => $role];
}

function require_owner(PDO $db, array $user, string $id): array
{
    $access = doc_access($db, $user, $id);
    if ($access['role'] !== 'owner') {
        fail(403, 'not_owner', 'Only the owner of a document can do this.');
    }
    return $access['row'];
}

/** A yes/no field as the column stores it: 1 or 0. */
function flag_field(array $in, string $name): int
{
    if (!is_bool($in[$name] ?? null)) {
        fail(400, 'bad_request', "Field '$name' must be true or false.");
    }
    return $in[$name] ? 1 : 0;
}

/** The project a document is filed under: none, or a project of the user's own. */
function project_field(PDO $db, array $user, array $in): ?string
{
    if (($in['project'] ?? null) === null) {
        return null;
    }
    $id = doc_id($in, 'project');
    $kind = run($db, 'SELECT kind FROM specs WHERE id = ? AND owner_id = ?', [$id, $user['id']])->fetchColumn();
    if ($kind !== 'project') {
        fail(404, 'no_project', 'This project does not exist or is not yours.');
    }
    return $id;
}

/** Validated fields of a document from the request; only the ones that were sent. */
function doc_fields(array $in, array $config): array
{
    $fields = [];
    if (array_key_exists('title', $in)) {
        $fields['title'] = text_field($in, 'title', 200);
    }
    if (array_key_exists('snippet', $in)) {
        $fields['snippet'] = mb_substr(text_field($in, 'snippet', 100000, false), 0, 500);
    }
    if (array_key_exists('template', $in)) {
        $fields['template'] = flag_field($in, 'template');
    }
    foreach (['page', 'styles'] as $name) { // settings the browser validates; stored as it sends them
        if (array_key_exists($name, $in)) {
            $fields[$name] = is_array($in[$name]) ? json_encode($in[$name]) : null;
            if ($fields[$name] !== null && strlen($fields[$name]) > MAX_SETTINGS_BYTES) {
                fail(413, 'too_large', 'These document settings are too large to store.');
            }
        }
    }
    if (array_key_exists('html', $in)) {
        if (!is_string($in['html'])) {
            fail(400, 'bad_request', 'The document content must be text.');
        }
        if (strlen($in['html']) > $config['max_document_bytes']) {
            fail(413, 'too_large', 'This document is too large to store. Remove or shrink some images.');
        }
        $fields['html'] = $in['html'];
    }
    return $fields;
}

function docs_list(PDO $db, array $user): array
{
    $own = run($db, 'SELECT ' . META . ' FROM documents d WHERE d.owner_id = ?', [$user['id']])->fetchAll();
    $shared = run($db, 'SELECT ' . META . ', s.role, u.name AS owner_name FROM shares s
        JOIN documents d ON d.id = s.doc_id JOIN users u ON u.id = d.owner_id WHERE s.user_id = ?', [$user['id']])->fetchAll();
    $documents = array_map(fn ($row) => doc_meta($row, 'owner', $user['name']), $own);
    foreach ($shared as $row) {
        $documents[] = doc_meta($row, $row['role'], $row['owner_name']);
    }
    return ['documents' => $documents];
}

function docs_get(PDO $db, array $user, array $in): array
{
    $id = doc_id($_GET);
    $access = doc_access($db, $user, $id);
    $html = run($db, 'SELECT html FROM documents WHERE id = ?', [$id])->fetchColumn();
    $versions = run($db, 'SELECT at, snippet, html FROM versions WHERE doc_id = ? ORDER BY at DESC, id DESC', [$id])->fetchAll();
    return [
        'document' => doc_meta($access['row'], $access['role'], $access['row']['owner_name']),
        'html' => $html,
        'versions' => array_map(fn ($v) => ['at' => (int) $v['at'], 'snippet' => $v['snippet'], 'html' => $v['html']], $versions),
    ];
}

function docs_create(PDO $db, array $user, array $in, array $config): array
{
    $id = doc_id($in);
    $fields = doc_fields($in, $config) + ['title' => 'Untitled document', 'snippet' => '', 'page' => null, 'styles' => null, 'template' => 0, 'html' => '<p><br></p>'];
    $project = project_field($db, $user, $in);
    if (run($db, 'SELECT 1 FROM documents WHERE id = ?', [$id])->fetch()) {
        fail(409, 'exists', 'A document with this id already exists.');
    }
    $now = now_ms();
    run($db, 'INSERT INTO documents (id, owner_id, title, snippet, page, styles, template, project_id, html, rev, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)', [
        $id, $user['id'], $fields['title'], $fields['snippet'], $fields['page'], $fields['styles'], $fields['template'], $project, $fields['html'], $now, $now,
    ]);
    return ['rev' => 1, 'updated' => $now];
}

function docs_update(PDO $db, array $user, array $in, array $config): array
{
    $id = doc_id($in);
    $access = doc_access($db, $user, $id, true);
    $row = $access['row'];
    // The client says which revision its changes are based on; a mismatch means someone else saved first.
    if (isset($in['rev']) && (int) $in['rev'] !== (int) $row['rev']) {
        fail(409, 'conflict', 'This document was changed somewhere else.');
    }
    $fields = doc_fields($in, $config);
    if (array_key_exists('project', $in)) {
        if ($access['role'] !== 'owner') {
            fail(403, 'not_owner', 'Only the owner of a document can file it under a project.');
        }
        $fields['project_id'] = project_field($db, $user, $in);
    }
    $now = now_ms();
    $rev = (int) $row['rev'] + 1;
    $set = implode(', ', array_map(fn ($name) => "$name = ?", array_keys($fields)));
    run($db, 'UPDATE documents SET ' . ($set ? "$set, " : '') . 'rev = ?, updated_at = ? WHERE id = ?', [...array_values($fields), $rev, $now, $id]);
    return ['rev' => $rev, 'updated' => $now];
}

/**
 * Copies a document, by default as "Copy of …" and a template only if the original is one. The owner's copy
 * stays in the original's project; a template, and anyone else's copy, is in none.
 */
function docs_copy(PDO $db, array $user, array $in): array
{
    $id = doc_id($in);
    $copy = doc_id($in, 'newId');
    $access = doc_access($db, $user, $id);
    $row = $access['row'];
    $title = array_key_exists('title', $in) ? text_field($in, 'title', 200) : mb_substr('Copy of ' . $row['title'], 0, 200);
    $template = array_key_exists('template', $in) ? flag_field($in, 'template') : (int) $row['template'];
    $project = !$template && $access['role'] === 'owner' ? $row['project_id'] : null;
    if (run($db, 'SELECT 1 FROM documents WHERE id = ?', [$copy])->fetch()) {
        fail(409, 'exists', 'A document with this id already exists.');
    }
    $now = now_ms();
    run($db, 'INSERT INTO documents (id, owner_id, title, snippet, page, styles, template, project_id, html, rev, created_at, updated_at)
        SELECT ?, ?, ?, snippet, page, styles, ?, ?, html, 1, ?, ? FROM documents WHERE id = ?', [
        $copy, $user['id'], $title, $template, $project, $now, $now, $id,
    ]);
    return ['rev' => 1, 'updated' => $now];
}

/** The owner deletes the document for everyone; anyone else only removes it from their own list. */
function docs_delete(PDO $db, array $user, array $in): array
{
    $id = doc_id($in);
    if (doc_access($db, $user, $id)['role'] !== 'owner') {
        run($db, 'DELETE FROM shares WHERE doc_id = ? AND user_id = ?', [$id, $user['id']]);
        return ['deleted' => false];
    }
    foreach (['versions' => 'doc_id', 'shares' => 'doc_id', 'documents' => 'id'] as $table => $column) {
        run($db, "DELETE FROM $table WHERE $column = ?", [$id]);
    }
    return ['deleted' => true];
}

function versions_add(PDO $db, array $user, array $in, array $config): array
{
    $id = doc_id($in);
    doc_access($db, $user, $id, true);
    $fields = doc_fields(['html' => $in['html'] ?? null, 'snippet' => $in['snippet'] ?? ''], $config);
    run($db, 'INSERT INTO versions (doc_id, at, snippet, html) VALUES (?, ?, ?, ?)', [$id, now_ms(), $fields['snippet'], $fields['html']]);
    $old = run($db, 'SELECT id FROM versions WHERE doc_id = ? ORDER BY at DESC, id DESC', [$id])->fetchAll(PDO::FETCH_COLUMN);
    foreach (array_slice($old, MAX_VERSIONS) as $versionId) {
        run($db, 'DELETE FROM versions WHERE id = ?', [$versionId]);
    }
    return ['ok' => true];
}
