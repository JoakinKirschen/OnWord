<?php
declare(strict_types=1);

/**
 * The AI reader: sends a contractor's offer (a PDF, or a spreadsheet as text) to the Claude API, which
 * returns its priced lines, matched to the project's articles. The API key stays on the server.
 *
 * The request is made with PHP's curl extension rather than Anthropic's PHP SDK, because the server part
 * takes no Composer packages (it must run on shared hosting as uploaded).
 */

const AI_API_VERSION = '2026-10-21';
const AI_FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const AI_MAX_TOKENS = 32000;
const AI_TIMEOUT_SECONDS = 280;
const AI_MAX_TEXT = 1000000;

const AI_INSTRUCTIONS = <<<'TEXT'
You read bills of quantities (meetstaten, métrés) that building contractors filled in with their prices.
List every line that has a unit price. For each line give the article number, the description, the unit,
the quantity and the unit price exactly as the file states them; use 0 for a quantity the file does not
give. If the file gives only a total for a line, divide it by the quantity to get the unit price. Leave
out headings, subtotals, totals and VAT.

Match each line to one of the project's articles listed below, by number first and otherwise by meaning,
and give that article's id. Give an empty id when no article fits; never guess one. Also give the name of
the contractor if the file shows it, otherwise an empty string.
TEXT;

/** The shape of the answer, enforced by the API's structured outputs. */
function ai_schema(): array
{
    $line = [
        'type' => 'object',
        'properties' => [
            'articleId' => ['type' => 'string'],
            'number' => ['type' => 'string'],
            'title' => ['type' => 'string'],
            'unit' => ['type' => 'string'],
            'quantity' => ['type' => 'number'],
            'price' => ['type' => 'number'],
        ],
        'required' => ['articleId', 'number', 'title', 'unit', 'quantity', 'price'],
        'additionalProperties' => false,
    ];
    return [
        'type' => 'object',
        'properties' => ['contractor' => ['type' => 'string'], 'lines' => ['type' => 'array', 'items' => $line]],
        'required' => ['contractor', 'lines'],
        'additionalProperties' => false,
    ];
}

/** The file as message content: a PDF document block, or the spreadsheet's text. */
function ai_file_content(array $in, array $config): array
{
    $name = text_field($in, 'name', 200);
    if (is_string($in['pdf'] ?? null) && $in['pdf'] !== '') {
        if (strlen($in['pdf']) * 3 / 4 > $config['ai_max_file_bytes'] || !preg_match('/^[A-Za-z0-9+\/]++=*$/', $in['pdf'])) {
            fail(413, 'too_large', 'This file is too large for the AI reader.');
        }
        return [['type' => 'document', 'source' => ['type' => 'base64', 'media_type' => 'application/pdf', 'data' => $in['pdf']], 'title' => $name]];
    }
    $text = $in['text'] ?? '';
    if (!is_string($text) || $text === '' || strlen($text) > AI_MAX_TEXT) {
        fail(400, 'bad_request', 'Send the file as a PDF or as text.');
    }
    return [['type' => 'text', 'text' => "The file \"$name\", one row per line, cells separated by tabs:\n\n$text"]];
}

/** Sends one request to the Messages API and returns the decoded response. */
function ai_request(array $config, array $body): array
{
    if (!function_exists('curl_init')) {
        fail(501, 'ai_unavailable', 'The AI reader needs PHP’s curl extension on the server.');
    }
    $curl = curl_init(rtrim($config['anthropic_base_url'], '/') . '/v1/messages');
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => AI_TIMEOUT_SECONDS,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'x-api-key: ' . $config['anthropic_api_key'],
            'anthropic-version: ' . AI_API_VERSION,
            'anthropic-beta: ' . AI_FALLBACK_BETA,
        ],
        CURLOPT_POSTFIELDS => json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ]);
    $raw = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);
    curl_close($curl);
    $response = is_string($raw) ? json_decode($raw, true) : null;
    if ($status !== 200 || !is_array($response)) {
        error_log("OnWord AI reader: HTTP $status $error " . (is_string($raw) ? substr($raw, 0, 500) : ''));
        fail(502, 'ai_failed', 'The AI reader could not be reached or gave no answer. Try again later.');
    }
    return $response;
}

/** The structured answer in a response, after checking why the model stopped. */
function ai_answer(array $response): array
{
    $stop = $response['stop_reason'] ?? '';
    if ($stop === 'refusal') {
        fail(422, 'ai_refused', 'The AI reader declined to read this file.');
    }
    if ($stop === 'max_tokens') {
        fail(413, 'ai_too_long', 'This offer has too many lines to read at once. Split the file and import the parts.');
    }
    foreach ($response['content'] ?? [] as $block) {
        if (($block['type'] ?? '') === 'text' && is_array($answer = json_decode($block['text'], true))) {
            return $answer;
        }
    }
    fail(502, 'ai_failed', 'The AI reader gave an answer that could not be read.');
}

function ai_read(PDO $db, array $user, array $in, array $config): array
{
    if ($config['anthropic_api_key'] === '') {
        fail(501, 'ai_unavailable', 'The AI reader is not set up on this server.');
    }
    $specId = doc_id($in, 'specId');
    own_project($db, $user, $specId);
    $articles = spec_articles($db, $specId);
    $list = implode("\n", array_map(fn ($a) => "{$a['id']}\t{$a['number']}\t{$a['title']}\t{$a['unit']}", $articles));
    @set_time_limit(AI_TIMEOUT_SECONDS + 20);
    $answer = ai_answer(ai_request($config, [
        'model' => $config['ai_model'],
        'max_tokens' => AI_MAX_TOKENS,
        'fallbacks' => 'default',
        'output_config' => ['effort' => $config['ai_effort'], 'format' => ['type' => 'json_schema', 'schema' => ai_schema()]],
        'system' => AI_INSTRUCTIONS . "\n\nThe project's articles (id, number, title, unit):\n" . $list,
        'messages' => [['role' => 'user', 'content' => [
            ...ai_file_content($in, $config),
            ['type' => 'text', 'text' => 'List the priced lines of this offer.'],
        ]]],
    ]));
    $known = array_flip(array_column($articles, 'id'));
    $lines = [];
    foreach (is_array($answer['lines'] ?? null) ? $answer['lines'] : [] as $line) {
        $price = number_field($line['price'] ?? null);
        if (!is_array($line) || !($price > 0)) {
            continue;
        }
        $quantity = number_field($line['quantity'] ?? null);
        $lines[] = [
            'articleId' => isset($known[$line['articleId'] ?? '']) ? $line['articleId'] : '',
            'number' => mb_substr((string) ($line['number'] ?? ''), 0, 60),
            'title' => mb_substr((string) ($line['title'] ?? ''), 0, 300),
            'unit' => mb_substr((string) ($line['unit'] ?? ''), 0, 30),
            'quantity' => $quantity > 0 ? $quantity : null,
            'price' => round($price, 2),
        ];
    }
    return ['contractor' => mb_substr((string) ($answer['contractor'] ?? ''), 0, 200), 'lines' => $lines];
}
