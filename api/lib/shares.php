<?php
declare(strict_types=1);

/** Sharing a document with other accounts: who it is shared with, adding someone and taking them off. */

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
