<?php
declare(strict_types=1);

/** Documents: listing, reading, creating, saving, copying, deleting, versions and sharing. */

const MAX_VERSIONS = 10;
const ID_PATTERN = '/^[a-z0-9]{8,32}$/';
const META = 'd.id, d.title, d.snippet, d.page, d.rev, d.created_at, d.updated_at, d.owner_id';

function doc_id(array $in, string $field = 'id'): string
{
    $id = $in[$field] ?? '';
    if (!is_string($id) || !preg_match(ID_PATTERN, $id)) {
        fail(400, 'bad_request', 'That is not a valid document id.');
    }
    return $id;
}

/** The metadata the client keeps for a document. `role` is owner, edit or view. */
function doc_meta(array $row, string $role, string $owner): array
{
    return [
        'id' => $row['id'],
        'title' => $row['title'],
        'snippet' => $row['snippet'],
        'page' => $row['page'] ? json_decode($row['page'], true) : null,
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
    if (array_key_exists('page', $in)) {
        $fields['page'] = is_array($in['page']) ? json_encode($in['page']) : null;
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
    $fields = doc_fields($in, $config) + ['title' => 'Untitled document', 'snippet' => '', 'page' => null, 'html' => '<p><br></p>'];
    if (run($db, 'SELECT 1 FROM documents WHERE id = ?', [$id])->fetch()) {
        fail(409, 'exists', 'A document with this id already exists.');
    }
    $now = now_ms();
    run($db, 'INSERT INTO documents (id, owner_id, title, snippet, page, html, rev, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)', [
        $id, $user['id'], $fields['title'], $fields['snippet'], $fields['page'], $fields['html'], $now, $now,
    ]);
    return ['rev' => 1, 'updated' => $now];
}

function docs_update(PDO $db, array $user, array $in, array $config): array
{
    $id = doc_id($in);
    $row = doc_access($db, $user, $id, true)['row'];
    // The client says which revision its changes are based on; a mismatch means someone else saved first.
    if (isset($in['rev']) && (int) $in['rev'] !== (int) $row['rev']) {
        fail(409, 'conflict', 'This document was changed somewhere else.');
    }
    $fields = doc_fields($in, $config);
    $now = now_ms();
    $rev = (int) $row['rev'] + 1;
    $set = implode(', ', array_map(fn ($name) => "$name = ?", array_keys($fields)));
    run($db, 'UPDATE documents SET ' . ($set ? "$set, " : '') . 'rev = ?, updated_at = ? WHERE id = ?', [...array_values($fields), $rev, $now, $id]);
    return ['rev' => $rev, 'updated' => $now];
}

function docs_copy(PDO $db, array $user, array $in): array
{
    $id = doc_id($in);
    $copy = doc_id($in, 'newId');
    $row = doc_access($db, $user, $id)['row'];
    if (run($db, 'SELECT 1 FROM documents WHERE id = ?', [$copy])->fetch()) {
        fail(409, 'exists', 'A document with this id already exists.');
    }
    $now = now_ms();
    run($db, 'INSERT INTO documents (id, owner_id, title, snippet, page, html, rev, created_at, updated_at)
        SELECT ?, ?, ?, snippet, page, html, 1, ?, ? FROM documents WHERE id = ?', [
        $copy, $user['id'], mb_substr('Copy of ' . $row['title'], 0, 200), $now, $now, $id,
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

function shares_list(PDO $db, array $user): array
{
    $id = doc_id($_GET);
    require_owner($db, $user, $id);
    $rows = run($db, 'SELECT u.id, u.name, u.email, s.role FROM shares s JOIN users u ON u.id = s.user_id WHERE s.doc_id = ? ORDER BY u.name', [$id])->fetchAll();
    return ['shares' => array_map(fn ($r) => ['userId' => (int) $r['id'], 'name' => $r['name'], 'email' => $r['email'], 'role' => $r['role']], $rows)];
}

function shares_add(PDO $db, array $user, array $in): array
{
    $id = doc_id($in);
    require_owner($db, $user, $id);
    $role = ($in['role'] ?? '') === 'edit' ? 'edit' : 'view';
    $other = run($db, 'SELECT id FROM users WHERE email = ?', [strtolower(text_field($in, 'email', 190))])->fetchColumn();
    if (!$other) {
        fail(404, 'no_such_user', 'Nobody has an account with that email address.');
    }
    if ((int) $other === $user['id']) {
        fail(400, 'own_document', 'This is your own document.');
    }
    run($db, 'DELETE FROM shares WHERE doc_id = ? AND user_id = ?', [$id, $other]);
    run($db, 'INSERT INTO shares (doc_id, user_id, role) VALUES (?, ?, ?)', [$id, $other, $role]);
    return ['ok' => true];
}

function shares_remove(PDO $db, array $user, array $in): array
{
    $id = doc_id($in);
    require_owner($db, $user, $id);
    run($db, 'DELETE FROM shares WHERE doc_id = ? AND user_id = ?', [$id, (int) ($in['userId'] ?? 0)]);
    return ['ok' => true];
}
