<?php
declare(strict_types=1);

/**
 * The price library: the unit prices the user gave articles taken from a master, in all of their own
 * projects. Other accounts' projects are private, and so are their prices. Each price comes with the
 * measurement lines of its article, from which the browser computes the quantity it was given for (the
 * formulas are evaluated in one place only, core/spec/formula.js).
 */

function prices_list(PDO $db, array $user): array
{
    $rows = run($db, 'SELECT a.source_id, a.unit, a.price, a.line_data, s.id AS spec_id, s.title, s.updated_at
        FROM articles a JOIN specs s ON s.id = a.spec_id
        WHERE s.owner_id = ? AND s.kind = ? AND a.source_id IS NOT NULL AND a.price > 0 AND a.removed = 0', [$user['id'], 'project'])->fetchAll();
    return ['prices' => array_map(fn ($row) => [
        'sourceId' => $row['source_id'],
        'specId' => $row['spec_id'],
        'project' => $row['title'],
        'unit' => $row['unit'],
        'price' => (float) $row['price'],
        'lines' => json_decode($row['line_data'], true) ?: [],
        'updated' => (int) $row['updated_at'],
    ], $rows)];
}
