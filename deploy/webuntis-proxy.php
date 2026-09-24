<?php
/**
 * Zustandsloser Reverse-Proxy für WebUntis (siehe PLAN.md R1/R8, IDEEN.md B1).
 *
 * WARUM: WebUntis sendet kein Access-Control-Allow-Credentials, und JSESSIONID ist
 * HttpOnly — der Browser kann die API deshalb nicht direkt ansprechen (gemessen, siehe
 * TESTING.md Abschnitt 1). Dieser Proxy läuft auf DERSELBEN Domain wie die ausgelieferte
 * App — dadurch ist jeder Aufruf same-origin, CORS betrifft ihn gar nicht erst. Kein
 * eigener CORS-Header nötig, keiner sollte hier gesetzt werden.
 *
 * Leitet NUR die fünf tatsächlich von der App genutzten Pfade unverändert an den echten
 * Server weiter (Methode, Query, Body, Cookie-Header in beide Richtungen) — nichts wird
 * gespeichert oder geloggt. Absichtlich eine feste Positivliste exakter Pfade statt eines
 * Prefix-Vergleichs: ein neuer, hier nicht gelisteter Pfad wird abgelehnt, nicht
 * durchgelassen. Der Ziel-Host ist FEST einprogrammiert (WEBUNTIS_HOST) — niemals vom
 * Client übernehmen, sonst wäre das ein offener Proxy (SSRF-Risiko).
 *
 * Pfad ist bewusst exakt "/WebUntis" (Großschreibung): WebUntis setzt das Session-Cookie
 * mit "Path=/WebUntis", Cookie-Pfade sind case-sensitiv — derselbe Grund, aus dem der
 * Dev-Proxy in vite.config.ts genauso benannt ist (siehe TESTING.md, "Cookie-Path-Bug").
 *
 * Setup: siehe deploy/README.md.
 */

declare(strict_types=1);

// Schulserver — an die eigene Schule anpassen (ohne "https://", ohne Pfad).
const WEBUNTIS_HOST = 'htlstp.webuntis.com';

// Exakte Pfade, die dieser Proxy weiterleitet. Jeder andere Pfad wird mit 404
// abgelehnt. Muss zu src/api/*.ts passen — bei einer neuen REST-Fundstelle dort
// auch hier ergänzen.
const ALLOWED_PATHS = [
    '/WebUntis/jsonrpc.do',
    '/WebUntis/api/exams',
    '/WebUntis/api/classreg/absences/students',
    '/WebUntis/api/rest/view/v2/calendar-entry/detail',
    '/WebUntis/api/token/new',
];

$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
$queryString = $_SERVER['QUERY_STRING'] ?? '';

if (!in_array($requestPath, ALLOWED_PATHS, true)) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Unbekannter Pfad']);
    exit;
}

if (!function_exists('curl_init')) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'PHP-curl-Erweiterung fehlt auf diesem Server']);
    exit;
}

$targetUrl = 'https://' . WEBUNTIS_HOST . $requestPath . ($queryString !== '' ? '?' . $queryString : '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// jsonrpc.do ist POST mit JSON-Body, die vier REST-Pfade sind GET ohne Body — beides wird
// hier gleich behandelt, der Body ist bei GET einfach leer.
$body = file_get_contents('php://input');

$forwardHeaders = ['Accept: application/json'];
if (isset($_SERVER['HTTP_COOKIE'])) {
    // Der Cookie-Header des Browsers wird unveraendert weitergereicht (JSESSIONID,
    // schoolname, Tenant-Id) — das ist der eigentliche Zweck dieses Proxys.
    $forwardHeaders[] = 'Cookie: ' . $_SERVER['HTTP_COOKIE'];
}
if ($method === 'POST') {
    $forwardHeaders[] = 'Content-Type: ' . ($_SERVER['CONTENT_TYPE'] ?? 'application/json');
}

$ch = curl_init($targetUrl);
curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_HTTPHEADER => $forwardHeaders,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_SSL_VERIFYPEER => true,
]);
if ($method === 'POST' && $body !== '') {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
}

$response = curl_exec($ch);

if ($response === false) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Verbindung zu WebUntis fehlgeschlagen']);
    curl_close($ch);
    exit;
}

$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
curl_close($ch);

$rawHeaders = substr($response, 0, $headerSize);
$responseBody = substr($response, $headerSize);

http_response_code($status);

// Nur das Nötigste durchreichen: Set-Cookie (Session!) und Content-Type. Alles andere
// (Server-Banner, eigene CORS-Header von WebUntis usw.) bleibt bewusst weg.
foreach (explode("\r\n", $rawHeaders) as $headerLine) {
    $lower = strtolower($headerLine);
    if (str_starts_with($lower, 'set-cookie:') || str_starts_with($lower, 'content-type:')) {
        header($headerLine, false);
    }
}

echo $responseBody;
