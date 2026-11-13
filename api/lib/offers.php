<?php
declare(strict_types=1);

/**
 * Offers: the bills of quantities contractors filled in for a project, as matched in the browser. Only
 * the owner of the project sees and changes them.
 */

const MAX_OFFER_PRICES = 5000;
const MAX_UNMATCHED = 2000;

/** The project, if it is the user's own; anything else answers as missing. */
function own_project(PDO $db, array $user, string $specId): array
{
    $spec = spec_access($db, $user, $specId);
    if ((int) $spec['owner_id'] !== $user['id'] || $spec['kind'] !== 'project') {
        fail(404, 'not_found', 'This project does not exist or is not yours.');
    }
    return $spec;
}

function number_field(mixed $value): float
{
    return is_numeric($value) && is_finite((float) $value) ? (float) $value : NAN;
}

/** An offer as sent by the browser, reduced to the fields it consists of. */
function clean_offer(array $offer): array
{
    $prices = [];
    foreach (array_slice(is_array($offer['prices'] ?? null) ? $offer['prices'] : [], 0, MAX_OFFER_PRICES, true) as $id => $p) {
        if (is_string($id) && preg_match(ID_PATTERN, $id) && is_array($p) && number_field($p['price'] ?? null) > 0) {
            $quantity = number_field($p['quantity'] ?? null);
            $prices[$id] = ['price' => (float) $p['price'], 'quantity' => is_nan($quantity) ? null : $quantity];
        }
    }
    $unmatched = [];
    foreach (array_slice(is_array($offer['unmatched'] ?? null) ? $offer['unmatched'] : [], 0, MAX_UNMATCHED) as $line) {
        if (is_array($line)) {
            $quantity = number_field($line['quantity'] ?? null);
            $unmatched[] = [
                'number' => mb_substr((string) ($line['number'] ?? ''), 0, 60),
                'title' => mb_substr((string) ($line['title'] ?? ''), 0, 300),
                'unit' => mb_substr((string) ($line['unit'] ?? ''), 0, 30),
                'quantity' => is_nan($quantity) ? null : $quantity,
                'price' => is_nan(number_field($line['price'] ?? null)) ? 0 : (float) $line['price'],
            ];
        }
    }
    return ['prices' => (object) $prices, 'unmatched' => $unmatched];
}

function offer_out(array $row): array
{
    // JSON has no NaN: a quantity the contractor did not give is stored and sent as null.
    $data = json_decode($row['data'], true) ?: [];
    $prices = [];
    foreach ($data['prices'] ?? [] as $id => $p) {
        $prices[$id] = ['price' => (float) $p['price'], 'quantity' => $p['quantity']];
    }
    return [
        'id' => $row['id'],
        'contractor' => $row['contractor'],
        'date' => (int) $row['created_at'],
        'prices' => (object) $prices,
        'unmatched' => $data['unmatched'] ?? [],
    ];
}

function offers_list(PDO $db, array $user): array
{
    $specId = doc_id($_GET, 'specId');
    own_project($db, $user, $specId);
    $rows = run($db, 'SELECT id, contractor, created_at, data FROM offers WHERE spec_id = ? ORDER BY created_at', [$specId])->fetchAll();
    return ['offers' => array_map('offer_out', $rows)];
}

function offers_save(PDO $db, array $user, array $in, array $config): array
{
    $specId = doc_id($in, 'specId');
    own_project($db, $user, $specId);
    $offer = is_array($in['offer'] ?? null) ? $in['offer'] : [];
    $id = doc_id($offer);
    $contractor = text_field($offer, 'contractor', 200);
    $data = json_encode(clean_offer($offer), JSON_UNESCAPED_UNICODE);
    if (strlen($data) > $config['max_document_bytes']) {
        fail(413, 'too_large', 'This offer is too large to store.');
    }
    $owner = run($db, 'SELECT spec_id FROM offers WHERE id = ?', [$id])->fetchColumn();
    if ($owner !== false && $owner !== $specId) {
        fail(409, 'exists', 'This offer belongs to another project.');
    }
    if ($owner === false) {
        $date = (int) (is_numeric($offer['date'] ?? null) ? $offer['date'] : now_ms());
        run($db, 'INSERT INTO offers (id, spec_id, contractor, created_at, data) VALUES (?, ?, ?, ?, ?)', [$id, $specId, $contractor, $date, $data]);
    } else {
        run($db, 'UPDATE offers SET contractor = ?, data = ? WHERE id = ?', [$contractor, $data, $id]);
    }
    return ['ok' => true];
}

function offers_delete(PDO $db, array $user, array $in): array
{
    $specId = doc_id($in, 'specId');
    own_project($db, $user, $specId);
    run($db, 'DELETE FROM offers WHERE id = ? AND spec_id = ?', [doc_id($in), $specId]);
    return ['ok' => true];
}
