<?php
declare(strict_types=1);

/**
 * Site reviews: visits to a project's site, with observations and their photos. Only the owner of the
 * project sees and changes them. The browser validates a review's structure; the server keeps it within
 * its limits and stores photos apart, so that saving the text does not send the images again.
 */

const MAX_OBSERVATIONS = 500;
const MAX_PHOTOS_PER_OBSERVATION = 50;
const REVIEW_STATUSES = ['ok', 'remark', 'defect'];
const DATE_PATTERN = '/^\d{4}-\d{2}-\d{2}$/';
const PHOTO_PATTERN = '/^data:image\/(jpeg|png);base64,[A-Za-z0-9+\/=]+$/';

function short_text(mixed $value, int $max = 200): string
{
    return mb_substr(is_string($value) ? $value : '', 0, $max);
}

function review_date(mixed $value): string
{
    return is_string($value) && preg_match(DATE_PATTERN, $value) ? $value : '';
}

/** A review as sent by the browser, reduced to the fields it consists of. */
function clean_review(array $review): array
{
    $observations = [];
    foreach (array_slice(is_array($review['observations'] ?? null) ? $review['observations'] : [], 0, MAX_OBSERVATIONS) as $o) {
        if (!is_array($o) || !is_string($o['id'] ?? null) || !preg_match(ID_PATTERN, $o['id'])) {
            continue;
        }
        $photos = [];
        foreach (array_slice(is_array($o['photos'] ?? null) ? $o['photos'] : [], 0, MAX_PHOTOS_PER_OBSERVATION) as $p) {
            if (is_array($p) && is_string($p['id'] ?? null) && preg_match(ID_PATTERN, $p['id'])) {
                $photos[] = ['id' => $p['id'], 'caption' => short_text($p['caption'] ?? '')];
            }
        }
        $articleId = $o['articleId'] ?? null;
        $observations[] = [
            'id' => $o['id'],
            'location' => short_text($o['location'] ?? ''),
            'articleId' => is_string($articleId) && preg_match(ID_PATTERN, $articleId) ? $articleId : null,
            'status' => in_array($o['status'] ?? '', REVIEW_STATUSES, true) ? $o['status'] : 'remark',
            'text' => short_text($o['text'] ?? '', 5000),
            'photos' => $photos,
            'action' => short_text($o['action'] ?? ''),
            'due' => review_date($o['due'] ?? ''),
            'done' => ($o['done'] ?? false) === true,
            'from' => is_int($o['from'] ?? null) ? $o['from'] : null,
        ];
    }
    return [
        'date' => review_date($review['date'] ?? ''),
        'attendees' => short_text($review['attendees'] ?? '', 5000),
        'weather' => short_text($review['weather'] ?? ''),
        'temperature' => short_text($review['temperature'] ?? ''),
        'notes' => short_text($review['notes'] ?? '', 5000),
        'observations' => $observations,
    ];
}

function reviews_list(PDO $db, array $user): array
{
    $specId = doc_id($_GET, 'specId');
    own_project($db, $user, $specId);
    $rows = run($db, 'SELECT id, number, updated_at, data FROM reviews WHERE spec_id = ? ORDER BY number', [$specId])->fetchAll();
    return ['reviews' => array_map(fn ($row) => [
        'id' => $row['id'],
        'number' => (int) $row['number'],
        'updated' => (int) $row['updated_at'],
    ] + (json_decode($row['data'], true) ?: []), $rows)];
}

/** The review, if it belongs to the project; anything else answers as missing. */
function own_review(PDO $db, string $specId, string $id): void
{
    if (!run($db, 'SELECT 1 FROM reviews WHERE id = ? AND spec_id = ?', [$id, $specId])->fetch()) {
        fail(404, 'not_found', 'This site review does not exist.');
    }
}

function reviews_save(PDO $db, array $user, array $in): array
{
    $specId = doc_id($in, 'specId');
    own_project($db, $user, $specId);
    $review = is_array($in['review'] ?? null) ? $in['review'] : [];
    $id = doc_id($review);
    $number = is_int($review['number'] ?? null) && $review['number'] > 0 ? $review['number'] : 1;
    $data = clean_review($review);
    $existing = run($db, 'SELECT spec_id FROM reviews WHERE id = ?', [$id])->fetchColumn();
    if ($existing !== false && $existing !== $specId) {
        fail(409, 'exists', 'This site review belongs to another project.');
    }
    $values = [$number, now_ms(), json_encode($data)];
    if ($existing === false) {
        run($db, 'INSERT INTO reviews (number, updated_at, data, id, spec_id) VALUES (?, ?, ?, ?, ?)', [...$values, $id, $specId]);
    } else {
        run($db, 'UPDATE reviews SET number = ?, updated_at = ?, data = ? WHERE id = ?', [...$values, $id]);
    }
    // Photos the review no longer refers to are dropped.
    $used = [];
    foreach ($data['observations'] as $o) {
        foreach ($o['photos'] as $p) {
            $used[$p['id']] = true;
        }
    }
    foreach (run($db, 'SELECT id FROM review_photos WHERE review_id = ?', [$id])->fetchAll(PDO::FETCH_COLUMN) as $photoId) {
        if (!isset($used[$photoId])) {
            run($db, 'DELETE FROM review_photos WHERE id = ?', [$photoId]);
        }
    }
    return ['ok' => true];
}

function reviews_delete(PDO $db, array $user, array $in): array
{
    $specId = doc_id($in, 'specId');
    own_project($db, $user, $specId);
    $id = doc_id($in);
    own_review($db, $specId, $id);
    run($db, 'DELETE FROM review_photos WHERE review_id = ?', [$id]);
    run($db, 'DELETE FROM reviews WHERE id = ?', [$id]);
    return ['ok' => true];
}

function photos_list(PDO $db, array $user): array
{
    $specId = doc_id($_GET, 'specId');
    own_project($db, $user, $specId);
    $reviewId = doc_id($_GET, 'reviewId');
    own_review($db, $specId, $reviewId);
    $rows = run($db, 'SELECT id, data FROM review_photos WHERE review_id = ?', [$reviewId])->fetchAll();
    return ['photos' => (object) array_column($rows, 'data', 'id')];
}

function photos_add(PDO $db, array $user, array $in, array $config): array
{
    $specId = doc_id($in, 'specId');
    own_project($db, $user, $specId);
    $reviewId = doc_id($in, 'reviewId');
    own_review($db, $specId, $reviewId);
    $id = doc_id($in);
    $data = $in['data'] ?? '';
    if (!is_string($data) || !preg_match(PHOTO_PATTERN, $data)) {
        fail(400, 'bad_request', 'A photo must be a JPEG or PNG image.');
    }
    if (strlen($data) > $config['max_photo_bytes']) {
        fail(413, 'too_large', 'This photo is too large to store.');
    }
    if (run($db, 'SELECT 1 FROM review_photos WHERE id = ?', [$id])->fetch()) {
        fail(409, 'exists', 'A photo with this id already exists.');
    }
    run($db, 'INSERT INTO review_photos (id, review_id, data) VALUES (?, ?, ?)', [$id, $reviewId, $data]);
    return ['ok' => true];
}
