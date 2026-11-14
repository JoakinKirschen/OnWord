<?php
declare(strict_types=1);

/**
 * Specifications: master texts and the project specifications built from them, each a tree of articles.
 * A master can be read by every account; only the owner of a specification changes it.
 */

const MAX_LINES = 500;
const SPEC_COLUMNS = 's.id, s.owner_id, s.kind, s.title, s.master_id, s.phase, s.lot, s.updated_at';
const ARTICLE_COLUMNS = 'id, parent_id, number, title, unit, html, source_id, line_data, price, removed';

function spec_out(array $row, array $user): array
{
    return [
        'id' => $row['id'],
        'kind' => $row['kind'],
        'title' => $row['title'],
        'masterId' => $row['master_id'],
        'phase' => $row['phase'],
        'lot' => $row['lot'],
        'updated' => (int) $row['updated_at'],
        'mine' => (int) $row['owner_id'] === $user['id'],
        'owner' => $row['owner_name'],
    ];
}

function article_out(array $row): array
{
    return [
        'id' => $row['id'],
        'parentId' => $row['parent_id'],
        'number' => $row['number'],
        'title' => $row['title'],
        'unit' => $row['unit'],
        'html' => $row['html'],
        'sourceId' => $row['source_id'],
        'lines' => json_decode($row['line_data'], true) ?: [],
        'price' => (float) $row['price'],
        'removed' => (bool) $row['removed'],
    ];
}

/** The specification, if the user may read it (or, with `$write`, change it). */
function spec_access(PDO $db, array $user, string $id, bool $write = false): array
{
    $row = run($db, 'SELECT ' . SPEC_COLUMNS . ', u.name AS owner_name FROM specs s JOIN users u ON u.id = s.owner_id WHERE s.id = ?', [$id])->fetch();
    $mine = $row && (int) $row['owner_id'] === $user['id'];
    if (!$row || (!$mine && $row['kind'] !== 'master')) {
        fail(404, 'not_found', 'This specification does not exist or is not yours.');
    }
    if ($write && !$mine) {
        fail(403, 'read_only', 'Only the owner can change this specification.');
    }
    return $row;
}

function spec_articles(PDO $db, string $specId): array
{
    return run($db, 'SELECT ' . ARTICLE_COLUMNS . ' FROM articles WHERE spec_id = ?', [$specId])->fetchAll();
}

function touch_spec(PDO $db, string $id): void
{
    run($db, 'UPDATE specs SET updated_at = ? WHERE id = ?', [now_ms(), $id]);
}

function specs_list(PDO $db, array $user): array
{
    $rows = run($db, 'SELECT ' . SPEC_COLUMNS . ', u.name AS owner_name FROM specs s JOIN users u ON u.id = s.owner_id
        WHERE s.owner_id = ? OR s.kind = ? ORDER BY s.updated_at DESC', [$user['id'], 'master'])->fetchAll();
    return ['specs' => array_map(fn ($row) => spec_out($row, $user), $rows)];
}

function specs_get(PDO $db, array $user): array
{
    $id = doc_id($_GET);
    $row = spec_access($db, $user, $id);
    return ['spec' => spec_out($row, $user), 'articles' => array_map('article_out', spec_articles($db, $id))];
}

/**
 * Copies the chosen articles of a master into a project. A copy hangs under the copy of its nearest
 * chosen ancestor, so the structure survives when a level in between was not chosen.
 */
function copy_master_articles(PDO $db, string $masterId, string $projectId, array $chosen): void
{
    $articles = [];
    foreach (spec_articles($db, $masterId) as $row) {
        $articles[$row['id']] = $row;
    }
    $copies = [];
    foreach (array_keys(array_intersect_key($articles, array_flip($chosen))) as $id) {
        $copies[$id] = bin2hex(random_bytes(8));
    }
    foreach ($copies as $id => $copyId) {
        $parent = null;
        for ($at = $articles[$id]['parent_id']; $at !== null && isset($articles[$at]); $at = $articles[$at]['parent_id']) {
            if (isset($copies[$at])) {
                $parent = $copies[$at];
                break;
            }
        }
        $a = $articles[$id];
        run($db, 'INSERT INTO articles (id, spec_id, parent_id, number, title, unit, html, source_id, line_data, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            $copyId, $projectId, $parent, $a['number'], $a['title'], $a['unit'], $a['html'], $id, '[]', $a['price'],
        ]);
    }
}

function specs_create(PDO $db, array $user, array $in): array
{
    $id = doc_id($in);
    $kind = ($in['kind'] ?? '') === 'master' ? 'master' : 'project';
    $masterId = null;
    if ($kind === 'project' && !empty($in['masterId'])) {
        $masterId = doc_id($in, 'masterId');
        if (spec_access($db, $user, $masterId)['kind'] !== 'master') {
            fail(400, 'bad_request', 'A project can only be based on a master specification.');
        }
    }
    if (run($db, 'SELECT 1 FROM specs WHERE id = ?', [$id])->fetch()) {
        fail(409, 'exists', 'A specification with this id already exists.');
    }
    $now = now_ms();
    run($db, 'INSERT INTO specs (id, owner_id, kind, title, master_id, phase, lot, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        $id, $user['id'], $kind, text_field($in, 'title', 200), $masterId,
        text_field($in, 'phase', 100, false), text_field($in, 'lot', 100, false), $now, $now,
    ]);
    $chosen = array_filter(is_array($in['articleIds'] ?? null) ? $in['articleIds'] : [], 'is_string');
    if ($masterId && $chosen) {
        copy_master_articles($db, $masterId, $id, $chosen);
    }
    return ['spec' => spec_out(spec_access($db, $user, $id), $user)];
}

function specs_update(PDO $db, array $user, array $in): array
{
    $id = doc_id($in);
    spec_access($db, $user, $id, true);
    foreach (['title' => 200, 'phase' => 100, 'lot' => 100] as $field => $max) {
        if (array_key_exists($field, $in)) {
            run($db, "UPDATE specs SET $field = ? WHERE id = ?", [text_field($in, $field, $max, $field === 'title'), $id]);
        }
    }
    touch_spec($db, $id);
    return ['ok' => true];
}

function specs_delete(PDO $db, array $user, array $in): array
{
    $id = doc_id($in);
    spec_access($db, $user, $id, true);
    run($db, 'DELETE FROM articles WHERE spec_id = ?', [$id]);
    run($db, 'DELETE FROM offers WHERE spec_id = ?', [$id]);
    run($db, 'DELETE FROM specs WHERE id = ?', [$id]);
    return ['ok' => true];
}

/** Measurement lines as sent by the client, reduced to the two text fields they consist of. */
function clean_lines(mixed $lines): string
{
    $clean = [];
    foreach (array_slice(is_array($lines) ? $lines : [], 0, MAX_LINES) as $line) {
        $clean[] = [
            'text' => mb_substr((string) ($line['text'] ?? ''), 0, 300),
            'formula' => mb_substr((string) ($line['formula'] ?? ''), 0, 300),
        ];
    }
    return json_encode($clean, JSON_UNESCAPED_UNICODE);
}

function articles_save(PDO $db, array $user, array $in, array $config): array
{
    $specId = doc_id($in, 'specId');
    spec_access($db, $user, $specId, true);
    $a = is_array($in['article'] ?? null) ? $in['article'] : [];
    $id = doc_id($a);
    $html = $a['html'] ?? '';
    if (!is_string($html) || strlen($html) > $config['max_document_bytes']) {
        fail(413, 'too_large', 'This article is too large to store.');
    }
    $values = [
        empty($a['parentId']) ? null : doc_id($a, 'parentId'),
        text_field($a, 'number', 60, false),
        text_field($a, 'title', 300, false),
        text_field($a, 'unit', 30, false),
        $html,
        empty($a['sourceId']) ? null : doc_id($a, 'sourceId'),
        clean_lines($a['lines'] ?? []),
        (float) ($a['price'] ?? 0),
        empty($a['removed']) ? 0 : 1,
    ];
    $owner = run($db, 'SELECT spec_id FROM articles WHERE id = ?', [$id])->fetchColumn();
    if ($owner !== false && $owner !== $specId) {
        fail(409, 'exists', 'This article belongs to another specification.');
    }
    if ($owner === false) {
        run($db, 'INSERT INTO articles (parent_id, number, title, unit, html, source_id, line_data, price, removed, id, spec_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [...$values, $id, $specId]);
    } else {
        run($db, 'UPDATE articles SET parent_id = ?, number = ?, title = ?, unit = ?, html = ?, source_id = ?, line_data = ?, price = ?, removed = ? WHERE id = ?', [...$values, $id]);
    }
    touch_spec($db, $specId);
    return ['ok' => true];
}

/** Deletes an article together with everything under it. */
function articles_delete(PDO $db, array $user, array $in): array
{
    $specId = doc_id($in, 'specId');
    spec_access($db, $user, $specId, true);
    $parents = [];
    foreach (spec_articles($db, $specId) as $row) {
        $parents[$row['id']] = $row['parent_id'];
    }
    $gone = [doc_id($in) => true];
    do {
        $grew = false;
        foreach ($parents as $id => $parent) {
            if ($parent !== null && isset($gone[$parent]) && !isset($gone[$id])) {
                $gone[$id] = $grew = true;
            }
        }
    } while ($grew);
    foreach (array_keys(array_intersect_key($gone, $parents)) as $id) {
        run($db, 'DELETE FROM articles WHERE id = ? AND spec_id = ?', [$id, $specId]);
    }
    touch_spec($db, $specId);
    return ['ok' => true];
}
