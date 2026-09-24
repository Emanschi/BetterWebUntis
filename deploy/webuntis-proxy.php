<?php
/**
 * Zustandsloser Reverse-Proxy für WebUntis (siehe PLAN.md R1/R8, IDEEN.md B1/B11).
 *
 * WARUM: WebUntis sendet kein Access-Control-Allow-Credentials, und JSESSIONID ist
 * HttpOnly — der Browser kann die API deshalb nicht direkt ansprechen (gemessen, siehe
 * TESTING.md Abschnitt 1). Dieser Proxy läuft auf DERSELBEN Domain wie die ausgelieferte
 * App — dadurch ist jeder Aufruf same-origin, CORS betrifft ihn gar nicht erst. Kein
 * eigener CORS-Header nötig, keiner sollte hier gesetzt werden.
 *
 * ZWEI ZIEL-ZONEN:
 *
 *  1) Schulsuche (SCHOOL_SEARCH_PUBLIC_PATH): geht IMMER an WebUntis' eigenen zentralen
 *     Verzeichnisdienst (SCHOOL_SEARCH_HOST) — gleich für jede Schule, deshalb fest
 *     einprogrammiert. Kein Login nötig (siehe api/schoolSearchRest.ts, gemessen
 *     2026-09-24, TESTING.md).
 *
 *  2) Die fünf tatsächlich von der App genutzten API-Pfade (ALLOWED_PATHS): das Ziel ist
 *     NICHT einprogrammiert, sondern kommt aus dem Header "X-WebUntis-Host", den der
 *     Browser mitschickt (siehe api/client.ts, WebUntisClientOptions.targetHost) — damit
 *     bedient EIN Deployment jede WebUntis-Schule, nicht nur eine fest eingetragene (siehe
 *     IDEEN.md B11). Validiert gegen ein strenges Muster (nur "<label>.webuntis.com",
 *     validateTargetHost()) — ungeprüft übernommen wäre das ein offener Proxy zu einem
 *     beliebigen Host (SSRF-Risiko).
 *
 * Leitet nur diese exakten Pfade unverändert weiter (Methode, Query, Body, Cookie-Header
 * in beide Richtungen) — nichts wird gespeichert oder geloggt. Absichtlich eine feste
 * Positivliste statt eines Prefix-Vergleichs: ein neuer, hier nicht gelisteter Pfad wird
 * abgelehnt, nicht durchgelassen.
 *
 * Pfad ist bewusst exakt "/WebUntis" (Großschreibung): WebUntis setzt das Session-Cookie
 * mit "Path=/WebUntis", Cookie-Pfade sind case-sensitiv — derselbe Grund, aus dem der
 * Dev-Proxy in vite.config.ts genauso benannt ist (siehe TESTING.md, "Cookie-Path-Bug").
 *
 * Setup: siehe deploy/README.md. Anders als vorher (bis v1.1.0) gibt es hier nichts mehr
 * pro Schule anzupassen — einfach hochladen.
 */

declare(strict_types=1);

// WebUntis' eigener, für alle Schulen gleicher Verzeichnisdienst -- fest, weil er (anders
// als der Schulserver selbst) nicht pro Schule verschieden ist. Gemessen 2026-09-24.
const SCHOOL_SEARCH_HOST = 'mobile.webuntis.com';
const SCHOOL_SEARCH_UPSTREAM_PATH = '/ms/schoolquery2';
const SCHOOL_SEARCH_PUBLIC_PATH = '/WebUntis/schoolsearch';

// Exakte Pfade, die dieser Proxy an die per X-WebUntis-Host angegebene Schule
// weiterleitet. Jeder andere Pfad wird mit 404 abgelehnt. Muss zu src/api/*.ts passen —
// bei einer neuen REST-Fundstelle dort auch hier ergänzen.
const ALLOWED_PATHS = [
    '/WebUntis/jsonrpc.do',
    '/WebUntis/api/exams',
    '/WebUntis/api/classreg/absences/students',
    '/WebUntis/api/rest/view/v2/calendar-entry/detail',
    '/WebUntis/api/token/new',
];

/**
 * Nur "<label>.webuntis.com" (ein Segment, klein, Ziffern/Bindestrich) — genau das Muster
 * jeder gemessenen Schule (siehe TESTING.md). Ohne diese Prüfung könnte der Header auf
 * einen beliebigen Host zeigen (SSRF) — deshalb strikt verankert (^…$), kein Teilstring-Match.
 */
function validateTargetHost(string $host): bool
{
    return (bool) preg_match('/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.webuntis\.com$/', $host);
}

/**
 * Liest den Authorization-Header des eingehenden Requests, so robust wie möglich: Apache
 * reicht diesen Header je nach Server-/PHP-Konfiguration NICHT immer in
 * $_SERVER['HTTP_AUTHORIZATION'] durch (bekannte, hostabhängige Eigenheit, nicht
 * WebUntis-spezifisch). Mehrere Quellen der Reihe nach probieren, keine bevorzugte
 * Konfiguration voraussetzen.
 */
function incomingAuthorizationHeader(): ?string
{
    if (isset($_SERVER['HTTP_AUTHORIZATION']) && $_SERVER['HTTP_AUTHORIZATION'] !== '') {
        return $_SERVER['HTTP_AUTHORIZATION'];
    }
    // Bei einem internen Rewrite (siehe .htaccess) legt Apache manche Header stattdessen
    // hier ab.
    if (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION']) && $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] !== '') {
        return $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    foreach (['apache_request_headers', 'getallheaders'] as $fn) {
        if (!function_exists($fn)) {
            continue;
        }
        foreach ($fn() as $name => $value) {
            if (strtolower($name) === 'authorization' && $value !== '') {
                return $value;
            }
        }
    }
    return null;
}

$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
$queryString = $_SERVER['QUERY_STRING'] ?? '';

if ($requestPath === SCHOOL_SEARCH_PUBLIC_PATH) {
    $targetHost = SCHOOL_SEARCH_HOST;
    $targetPath = SCHOOL_SEARCH_UPSTREAM_PATH;
} elseif (in_array($requestPath, ALLOWED_PATHS, true)) {
    $targetHost = $_SERVER['HTTP_X_WEBUNTIS_HOST'] ?? '';
    if (!validateTargetHost($targetHost)) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Fehlender oder ungueltiger X-WebUntis-Host Header']);
        exit;
    }
    $targetPath = $requestPath;
} else {
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

$targetUrl = 'https://' . $targetHost . $targetPath . ($queryString !== '' ? '?' . $queryString : '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// jsonrpc.do/schoolsearch sind POST mit JSON-Body, die vier REST-Pfade sind GET ohne
// Body — beides wird hier gleich behandelt, der Body ist bei GET einfach leer.
$body = file_get_contents('php://input');

$forwardHeaders = ['Accept: application/json'];
if (isset($_SERVER['HTTP_COOKIE'])) {
    // Der Cookie-Header des Browsers wird unveraendert weitergereicht (JSESSIONID,
    // schoolname, Tenant-Id) — das ist der eigentliche Zweck dieses Proxys. Bei der
    // Schulsuche schickt der Browser ohnehin keinen mit (kein Login noetig, siehe oben).
    $forwardHeaders[] = 'Cookie: ' . $_SERVER['HTTP_COOKIE'];
}
if ($method === 'POST') {
    $forwardHeaders[] = 'Content-Type: ' . ($_SERVER['CONTENT_TYPE'] ?? 'application/json');
}
// Bearer-Token fuer calendar-entry/detail (siehe api/client.ts getRestBearer()) — OHNE das
// hier landet jeder Aufruf ohne gueltigen Token beim echten Server und bekommt HTTP 404
// (Bug bis einschl. v1.2.0: dieser Header wurde komplett vergessen, siehe IDEEN.md).
// Mehrere Fallbacks, weil Apache den Authorization-Header PHP oft gar nicht erst
// durchreicht -- .htaccess erzwingt HTTP_AUTHORIZATION zusaetzlich per RewriteRule.
$incomingAuth = incomingAuthorizationHeader();
if ($incomingAuth !== null) {
    $forwardHeaders[] = 'Authorization: ' . $incomingAuth;
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
