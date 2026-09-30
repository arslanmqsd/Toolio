export interface HttpStatus {
  code: number;
  /** Reason phrase as registered today (RFC 9110 names where they changed). */
  name: string;
  /** One plain-language line. */
  summary: string;
  /** Where people actually run into it. */
  seenWhen: string;
  /** What a client or server developer should do about it. */
  whatToDo: string;
  headers?: string[];
  /** Defining spec. Absent for vendor codes. */
  spec?: { label: string; url: string };
  /** Vendor that uses this unofficial code. */
  source?: "nginx" | "Cloudflare";
  /** Heuristically cacheable by default (RFC 9110 §15.1). */
  cacheable?: boolean;
  /** No longer part of any current spec. */
  deprecated?: boolean;
  /** Old names and phrasings people search for. */
  keywords: string[];
}

export type StatusClassId = 1 | 2 | 3 | 4 | 5;

export const STATUS_CLASSES: readonly { id: StatusClassId; label: string; name: string; description: string }[] = [
  { id: 1, label: "1xx", name: "Informational", description: "An interim response. The request was received and is still being handled." },
  { id: 2, label: "2xx", name: "Success", description: "The request was received, understood, and accepted." },
  { id: 3, label: "3xx", name: "Redirection", description: "The client needs to take another step, usually following a redirect." },
  { id: 4, label: "4xx", name: "Client error", description: "Something about the request is wrong. Retrying it unchanged won't help." },
  { id: 5, label: "5xx", name: "Server error", description: "The server failed to handle a request that looked valid." },
];

const rfc = (n: number, section?: string) => ({
  label: `RFC ${n}${section ? ` §${section}` : ""}`,
  url: `https://www.rfc-editor.org/rfc/rfc${n}${section ? `#section-${section}` : ""}`,
});
const rfc9110 = (section: string) => rfc(9110, section);

export const HTTP_STATUSES: readonly HttpStatus[] = [
  {
    code: 100,
    name: "Continue",
    summary: "The server has the request headers; the client can go ahead and send the body.",
    seenWhen: "Before large uploads. curl and many HTTP libraries send Expect: 100-continue and wait for this before sending the body.",
    whatToDo: "Usually handled by your HTTP library. If uploads stall for about a second before starting, the server may be ignoring Expect; send the request without that header.",
    headers: ["Expect"],
    spec: rfc9110("15.2.1"),
    keywords: ["expect", "100-continue", "upload"],
  },
  {
    code: 101,
    name: "Switching Protocols",
    summary: "The server agrees to switch to the protocol the client asked for in Upgrade.",
    seenWhen: "Every successful WebSocket connection starts with a 101 response to the handshake.",
    whatToDo: "Expected for WebSockets. If the handshake fails behind a reverse proxy, the proxy must forward the Upgrade and Connection headers (in nginx, set them with proxy_set_header and use proxy_http_version 1.1).",
    headers: ["Upgrade", "Connection"],
    spec: rfc9110("15.2.2"),
    keywords: ["websocket", "upgrade", "handshake", "ws"],
  },
  {
    code: 102,
    name: "Processing",
    summary: "WebDAV interim response saying a long request is still being worked on.",
    seenWhen: "Rarely. Defined for WebDAV and later dropped from the spec; some old servers still send it.",
    whatToDo: "Nothing to do; clients should wait for the final response. Don't use it in new APIs; return 202 Accepted and a status URL instead.",
    spec: rfc(2518, "10.1"),
    deprecated: true,
    keywords: ["webdav", "long running"],
  },
  {
    code: 103,
    name: "Early Hints",
    summary: "Sends Link headers early so the browser can start preloading while the server prepares the real response.",
    seenWhen: "From CDNs and servers that support it, sent ahead of slow HTML responses to preload CSS, fonts, or preconnect to origins.",
    whatToDo: "Clients need do nothing. Servers can send Link: <…>; rel=preload for critical assets. Browsers only act on it over HTTP/2 or HTTP/3.",
    headers: ["Link"],
    spec: rfc(8297, "2"),
    keywords: ["preload", "preconnect", "performance", "link header"],
  },
  {
    code: 200,
    name: "OK",
    summary: "The request succeeded.",
    seenWhen: "Everywhere. Watch for APIs that return 200 with an error message in the body; check the body, not just the status.",
    whatToDo: "Nothing to fix. If you build APIs, return 4xx or 5xx for failures so clients, retries, and monitoring can tell them apart.",
    spec: rfc9110("15.3.1"),
    cacheable: true,
    keywords: ["success", "ok"],
  },
  {
    code: 201,
    name: "Created",
    summary: "The request succeeded and created a new resource.",
    seenWhen: "After a POST (or PUT) that creates something, like a new user or order.",
    whatToDo: "Servers should include a Location header pointing to the new resource. Clients can read it instead of building the URL themselves.",
    headers: ["Location"],
    spec: rfc9110("15.3.2"),
    keywords: ["created", "post", "new resource"],
  },
  {
    code: 202,
    name: "Accepted",
    summary: "The request was accepted for processing, but the work isn't done yet.",
    seenWhen: "Async jobs: exports, video processing, bulk imports, webhooks queued for delivery.",
    whatToDo: "Don't assume the work succeeded. Servers should return a status URL (often in Location) that clients can poll, or notify them when it finishes.",
    headers: ["Location", "Retry-After"],
    spec: rfc9110("15.3.3"),
    keywords: ["async", "queued", "background job", "accepted"],
  },
  {
    code: 203,
    name: "Non-Authoritative Information",
    summary: "Success, but a proxy changed the response from what the origin sent.",
    seenWhen: "Rarely. A transforming proxy modified a 200 response.",
    whatToDo: "Treat it like 200. The body may differ from the origin's.",
    spec: rfc9110("15.3.4"),
    cacheable: true,
    keywords: ["proxy", "transformed"],
  },
  {
    code: 204,
    name: "No Content",
    summary: "Success, and there's deliberately no body.",
    seenWhen: "DELETE and PUT endpoints, analytics beacons, and CORS preflight responses.",
    whatToDo: "Clients: don't parse a body. Calling response.json() on a 204 throws. Servers: don't send one; some clients hang or error if you do.",
    spec: rfc9110("15.3.5"),
    cacheable: true,
    keywords: ["empty", "no body", "delete"],
  },
  {
    code: 205,
    name: "Reset Content",
    summary: "Success; the client should reset the view that sent the request, such as clearing a form.",
    seenWhen: "Almost never. Browsers don't reset forms on it.",
    whatToDo: "Treat it like 204 No Content. Handle form resets in your own client code.",
    spec: rfc9110("15.3.6"),
    keywords: ["reset form"],
  },
  {
    code: 206,
    name: "Partial Content",
    summary: "The server is sending only the byte range the client asked for.",
    seenWhen: "Video and audio seeking, resumable downloads, and download managers fetching a file in parallel chunks.",
    whatToDo: "Expected when a Range header was sent. Servers that support ranges should send Accept-Ranges: bytes and a correct Content-Range.",
    headers: ["Range", "Content-Range", "Accept-Ranges"],
    spec: rfc9110("15.3.7"),
    cacheable: true,
    keywords: ["range", "partial", "video streaming", "resume download"],
  },
  {
    code: 207,
    name: "Multi-Status",
    summary: "The body holds separate status codes for several operations.",
    seenWhen: "WebDAV (file sync, CalDAV, CardDAV) and some batch APIs.",
    whatToDo: "Don't treat the whole response as a success; read the status of each item in the body.",
    spec: rfc(4918, "11.1"),
    keywords: ["webdav", "batch", "multiple"],
  },
  {
    code: 300,
    name: "Multiple Choices",
    summary: "There are several representations to choose from.",
    seenWhen: "Rarely. Few servers do this kind of content negotiation.",
    whatToDo: "Pick one of the listed options. Servers may name a preferred one in Location.",
    headers: ["Location"],
    spec: rfc9110("15.4.1"),
    cacheable: true,
    keywords: ["negotiation", "choices"],
  },
  {
    code: 301,
    name: "Moved Permanently",
    summary: "The resource has a new permanent URL, given in Location.",
    seenWhen: "Domain moves, http → https, adding or removing www or a trailing slash, restructured URLs.",
    whatToDo: "Browsers cache 301s aggressively, often with no expiry, so test with 302 first. Clients may turn a POST into a GET when following it; use 308 to keep the method and body.",
    headers: ["Location"],
    spec: rfc9110("15.4.2"),
    cacheable: true,
    keywords: ["redirect", "moved", "permanent", "seo", "https redirect"],
  },
  {
    code: 302,
    name: "Found",
    summary: "The resource is temporarily at another URL, given in Location.",
    seenWhen: "Login redirects, temporary maintenance pages, A/B tests.",
    whatToDo: "Browsers change POST to GET when following it, for historical reasons. Say what you mean: 303 to redirect to a GET page, 307 to repeat the same method.",
    headers: ["Location"],
    spec: rfc9110("15.4.3"),
    keywords: ["redirect", "temporary", "moved temporarily", "found"],
  },
  {
    code: 303,
    name: "See Other",
    summary: "Go fetch a different URL with GET.",
    seenWhen: "After a form POST, redirecting to a result page (the Post/Redirect/Get pattern), so refreshing doesn't resubmit.",
    whatToDo: "Use it after successful form submissions. Clients always follow it with GET.",
    headers: ["Location"],
    spec: rfc9110("15.4.4"),
    keywords: ["redirect", "post redirect get", "prg", "form"],
  },
  {
    code: 304,
    name: "Not Modified",
    summary: "The cached copy is still valid, so no body is sent.",
    seenWhen: "Conditional requests with If-None-Match or If-Modified-Since, sent by browsers revalidating a cached file. Common in DevTools.",
    whatToDo: "Nothing to fix; the cache is working. Browsers turn it into the cached 200 for your code unless you sent the conditional headers yourself.",
    headers: ["ETag", "Last-Modified", "If-None-Match", "If-Modified-Since"],
    spec: rfc9110("15.4.5"),
    keywords: ["cache", "etag", "conditional", "revalidate"],
  },
  {
    code: 307,
    name: "Temporary Redirect",
    summary: "Temporarily at another URL; repeat the request there with the same method and body.",
    seenWhen: "Temporary moves of API endpoints. Chrome also shows \"307 Internal Redirect\" when HSTS upgrades http to https; no request is made for that one.",
    whatToDo: "Use it instead of 302 when a POST or PUT must be repeated at the new URL.",
    headers: ["Location"],
    spec: rfc9110("15.4.8"),
    keywords: ["redirect", "temporary", "hsts", "internal redirect", "keep method"],
  },
  {
    code: 308,
    name: "Permanent Redirect",
    summary: "Permanently at another URL; repeat the request there with the same method and body.",
    seenWhen: "Permanent moves of APIs and sites, where POSTs must not become GETs. Some frameworks use it for trailing-slash redirects.",
    whatToDo: "Use it instead of 301 when the method must be kept. Like 301, it's cached, so be sure before shipping it.",
    headers: ["Location"],
    spec: rfc9110("15.4.9"),
    cacheable: true,
    keywords: ["redirect", "moved", "keep method"],
  },
  {
    code: 400,
    name: "Bad Request",
    summary: "The server couldn't understand the request.",
    seenWhen: "Malformed JSON, a body that doesn't match its Content-Type, invalid query parameters. nginx also sends 400 when cookies or headers are too large.",
    whatToDo: "Read the response body for details. Check the JSON is valid and matches Content-Type. For well-formed input that fails validation, many APIs use 422 instead.",
    spec: rfc9110("15.5.1"),
    keywords: ["bad request", "malformed", "invalid json", "validation"],
  },
  {
    code: 401,
    name: "Unauthorized",
    summary: "You aren't authenticated: credentials are missing, invalid, or expired.",
    seenWhen: "Missing or expired tokens, a wrong API key, or a malformed Authorization header (for example, a missing \"Bearer \" prefix).",
    whatToDo: "Sign in again or refresh the token, then retry. Servers should send WWW-Authenticate. It means \"who are you?\"; for \"you can't do this\", use 403.",
    headers: ["WWW-Authenticate", "Authorization"],
    spec: rfc9110("15.5.2"),
    keywords: ["unauthenticated", "login", "token expired", "api key", "auth"],
  },
  {
    code: 402,
    name: "Payment Required",
    summary: "Reserved for payments. It has no standard meaning, so APIs use it their own way.",
    seenWhen: "Stripe returns it when valid parameters still fail, like a declined card. Other APIs use it for exhausted quotas or unpaid plans.",
    whatToDo: "Check the API's docs and the response body; the meaning varies by provider.",
    spec: rfc9110("15.5.3"),
    keywords: ["payment", "billing", "quota", "card declined"],
  },
  {
    code: 403,
    name: "Forbidden",
    summary: "The server knows who you are (or doesn't care) and still refuses.",
    seenWhen: "Missing permissions or roles, WAF or CDN blocks, disabled directory listing. S3 returns 403 instead of 404 for missing objects when you can't list the bucket.",
    whatToDo: "Signing in again won't help. Check roles, IAM policies, IP allowlists, and file permissions. Use 401 when the issue is missing credentials.",
    spec: rfc9110("15.5.4"),
    keywords: ["forbidden", "permission denied", "access denied", "not allowed", "waf"],
  },
  {
    code: 404,
    name: "Not Found",
    summary: "Nothing exists at this URL (or the server won't say it does).",
    seenWhen: "Typos, deleted pages, wrong API base path. Refreshing a client-side route on a static host too. GitHub returns 404 for private repos you can't see.",
    whatToDo: "Check the path and base URL. For single-page apps, configure the host to serve index.html for unknown routes. Use 410 when something is gone for good.",
    spec: rfc9110("15.5.5"),
    cacheable: true,
    keywords: ["not found", "missing", "broken link", "page not found"],
  },
  {
    code: 405,
    name: "Method Not Allowed",
    summary: "This URL exists but doesn't accept this HTTP method.",
    seenWhen: "POSTing to a GET-only route or a static file host, or an unhandled OPTIONS preflight for CORS.",
    whatToDo: "Use a method listed in the Allow header (servers must send it). If it's a CORS preflight, make the server answer OPTIONS.",
    headers: ["Allow"],
    spec: rfc9110("15.5.6"),
    cacheable: true,
    keywords: ["method not allowed", "wrong method", "options", "cors"],
  },
  {
    code: 406,
    name: "Not Acceptable",
    summary: "The server can't produce a response in any format the Accept headers allow.",
    seenWhen: "Strict content negotiation, such as sending Accept: application/xml to a JSON-only API. Some WAFs, like ModSecurity, also use 406 to block requests.",
    whatToDo: "Loosen or fix the Accept header (Accept: application/json, or */*). If a WAF is responsible, check its logs.",
    headers: ["Accept", "Accept-Language", "Accept-Encoding"],
    spec: rfc9110("15.5.7"),
    keywords: ["accept", "content negotiation", "mod_security"],
  },
  {
    code: 407,
    name: "Proxy Authentication Required",
    summary: "A proxy between you and the server wants credentials.",
    seenWhen: "Corporate networks with authenticating proxies, often in CI or build tools.",
    whatToDo: "Configure proxy credentials, for example HTTPS_PROXY=http://user:pass@proxy:port, or your tool's proxy settings.",
    headers: ["Proxy-Authenticate", "Proxy-Authorization"],
    spec: rfc9110("15.5.8"),
    keywords: ["proxy", "corporate network"],
  },
  {
    code: 408,
    name: "Request Timeout",
    summary: "The client took too long to send the request, so the server gave up.",
    seenWhen: "Slow or stalled uploads, or idle keep-alive connections the server closes. Browsers usually retry these automatically.",
    whatToDo: "Safe to retry. For slow uploads, check network conditions or raise the server's client body timeout.",
    headers: ["Connection"],
    spec: rfc9110("15.5.9"),
    keywords: ["timeout", "slow client", "idle connection"],
  },
  {
    code: 409,
    name: "Conflict",
    summary: "The request conflicts with the current state of the resource.",
    seenWhen: "Duplicate usernames or emails, edit conflicts, creating something that already exists, version mismatches.",
    whatToDo: "Fetch the latest state, resolve the conflict, and retry. Servers should explain the conflict in the body.",
    spec: rfc9110("15.5.10"),
    keywords: ["conflict", "duplicate", "already exists", "version"],
  },
  {
    code: 410,
    name: "Gone",
    summary: "The resource was deliberately removed and won't come back.",
    seenWhen: "Deleted accounts or posts, retired API versions, expired promotions.",
    whatToDo: "Stop requesting it and remove links. Search engines drop a 410 faster than a 404.",
    spec: rfc9110("15.5.11"),
    cacheable: true,
    keywords: ["gone", "deleted", "removed", "deprecated api"],
  },
  {
    code: 411,
    name: "Length Required",
    summary: "The server needs a Content-Length header.",
    seenWhen: "POSTs with no body and no Content-Length, or chunked uploads to servers that don't accept them.",
    whatToDo: "Send Content-Length (Content-Length: 0 for an empty POST).",
    headers: ["Content-Length"],
    spec: rfc9110("15.5.12"),
    keywords: ["content-length", "chunked"],
  },
  {
    code: 412,
    name: "Precondition Failed",
    summary: "A condition in the request headers (like If-Match) wasn't met.",
    seenWhen: "Optimistic concurrency: someone else changed the resource after you read it, so your ETag no longer matches.",
    whatToDo: "Fetch the latest version, merge your changes, and retry with the new ETag.",
    headers: ["If-Match", "If-Unmodified-Since", "ETag"],
    spec: rfc9110("15.5.13"),
    keywords: ["etag", "if-match", "concurrency", "precondition"],
  },
  {
    code: 413,
    name: "Content Too Large",
    summary: "The request body is bigger than the server accepts.",
    seenWhen: "File uploads. nginx rejects bodies over 1 MB unless client_max_body_size is raised, and many platforms have their own limits.",
    whatToDo: "Raise the limit (nginx client_max_body_size, or your framework's body parser limit), or upload directly to storage with a presigned URL.",
    headers: ["Retry-After"],
    spec: rfc9110("15.5.14"),
    keywords: ["payload too large", "request entity too large", "upload too big", "file too large", "client_max_body_size"],
  },
  {
    code: 414,
    name: "URI Too Long",
    summary: "The URL is longer than the server will handle.",
    seenWhen: "Huge query strings, like sending data via GET that belongs in a POST body, or redirect loops that keep appending parameters.",
    whatToDo: "Move the data into a POST body. If it's a redirect loop, fix the redirect.",
    spec: rfc9110("15.5.15"),
    cacheable: true,
    keywords: ["url too long", "request-uri too long", "query string"],
  },
  {
    code: 415,
    name: "Unsupported Media Type",
    summary: "The server doesn't accept the body's format.",
    seenWhen: "Sending JSON without Content-Type: application/json, or form data to a JSON endpoint.",
    whatToDo: "Set Content-Type to match the body, in the format the API expects.",
    headers: ["Content-Type", "Content-Encoding", "Accept-Post"],
    spec: rfc9110("15.5.16"),
    keywords: ["content-type", "media type", "json", "wrong format"],
  },
  {
    code: 416,
    name: "Range Not Satisfiable",
    summary: "The requested byte range is outside the file.",
    seenWhen: "Resuming a download of a file that has since shrunk or changed, or a Range starting past the end.",
    whatToDo: "Request the whole file again. The Content-Range header (bytes */size) gives the current size.",
    headers: ["Range", "Content-Range"],
    spec: rfc9110("15.5.17"),
    keywords: ["range", "requested range not satisfiable", "resume download"],
  },
  {
    code: 417,
    name: "Expectation Failed",
    summary: "The server can't meet the request's Expect header.",
    seenWhen: "Clients sending Expect: 100-continue through proxies or servers that don't support it.",
    whatToDo: "Send the request without the Expect header.",
    headers: ["Expect"],
    spec: rfc9110("15.5.18"),
    keywords: ["expect", "100-continue"],
  },
  {
    code: 418,
    name: "I'm a teapot",
    summary: "An April Fools' joke from the Hyper Text Coffee Pot Control Protocol.",
    seenWhen: "Easter eggs, and some sites use it to turn away bots. HTTP itself reserves it as unused so it's never given a real meaning.",
    whatToDo: "Don't use it for real errors; clients and monitoring won't understand it.",
    spec: rfc9110("15.5.19"),
    keywords: ["teapot", "htcpcp", "joke", "april fools"],
  },
  {
    code: 421,
    name: "Misdirected Request",
    summary: "The request reached a server that can't answer for this host.",
    seenWhen: "HTTP/2 connection reuse across hostnames that share a TLS certificate but aren't all served by the same server, or SNI/Host mismatches.",
    whatToDo: "Clients may retry on a new connection. Servers: check virtual host and TLS certificate configuration.",
    spec: rfc9110("15.5.20"),
    keywords: ["http2", "sni", "connection reuse", "misdirected"],
  },
  {
    code: 422,
    name: "Unprocessable Content",
    summary: "The request is well-formed, but its content fails validation.",
    seenWhen: "Validation errors: FastAPI, Rails, and many JSON APIs use it for missing fields or invalid values.",
    whatToDo: "Read the per-field errors in the body and fix the input. 400 means the request couldn't be parsed; 422 means it parsed but didn't make sense.",
    spec: rfc9110("15.5.21"),
    keywords: ["unprocessable entity", "validation error", "invalid field", "semantic"],
  },
  {
    code: 423,
    name: "Locked",
    summary: "The resource is locked (WebDAV).",
    seenWhen: "Editing a file someone else has open in a WebDAV or SharePoint-style system.",
    whatToDo: "Wait for the lock to be released, or ask whoever holds it.",
    spec: rfc(4918, "11.3"),
    keywords: ["webdav", "locked", "file lock"],
  },
  {
    code: 424,
    name: "Failed Dependency",
    summary: "This action failed because another action it depended on failed (WebDAV).",
    seenWhen: "WebDAV batch operations, and some APIs for steps that failed because an earlier step failed.",
    whatToDo: "Find and fix the operation that failed first.",
    spec: rfc(4918, "11.4"),
    keywords: ["webdav", "dependency", "batch"],
  },
  {
    code: 425,
    name: "Too Early",
    summary: "The server won't process a request that could be replayed.",
    seenWhen: "TLS 1.3 early data (0-RTT): the server asks the client to resend after the handshake completes.",
    whatToDo: "Clients should retry after the handshake; most libraries do this automatically.",
    headers: ["Early-Data"],
    spec: rfc(8470, "5.2"),
    keywords: ["tls 1.3", "0-rtt", "early data", "replay"],
  },
  {
    code: 426,
    name: "Upgrade Required",
    summary: "The server needs the client to switch protocols first.",
    seenWhen: "Opening a WebSocket URL with plain HTTP. Node's ws library, for example, answers ordinary requests with 426.",
    whatToDo: "Connect with the protocol named in the Upgrade header (for WebSockets, use a WebSocket client).",
    headers: ["Upgrade"],
    spec: rfc9110("15.5.22"),
    keywords: ["upgrade", "websocket", "protocol"],
  },
  {
    code: 428,
    name: "Precondition Required",
    summary: "The server requires a conditional request, such as If-Match.",
    seenWhen: "APIs that prevent lost updates by requiring an ETag on every write.",
    whatToDo: "GET the resource, then send its ETag in If-Match with your update.",
    headers: ["If-Match", "ETag"],
    spec: rfc(6585, "3"),
    keywords: ["if-match", "etag", "lost update", "concurrency"],
  },
  {
    code: 429,
    name: "Too Many Requests",
    summary: "You've been rate limited.",
    seenWhen: "Hitting API rate limits or quotas, login attempt limits, and scrapers. Some CDNs return it during DDoS protection.",
    whatToDo: "Wait for Retry-After if present; otherwise back off exponentially with jitter. Watch the API's rate limit headers to stay under the limit.",
    headers: ["Retry-After", "RateLimit-Limit", "RateLimit-Remaining", "X-RateLimit-Reset"],
    spec: rfc(6585, "4"),
    keywords: ["rate limit", "rate limited", "rate limiting", "throttled", "throttling", "too many requests", "quota"],
  },
  {
    code: 431,
    name: "Request Header Fields Too Large",
    summary: "The request headers, often cookies, are too big.",
    seenWhen: "Cookie buildup on localhost or long-lived domains, or huge auth tokens. Node.js rejects headers over 16 KB by default.",
    whatToDo: "Clear the site's cookies and shrink tokens. Servers can raise the limit (Node: --max-http-header-size).",
    headers: ["Cookie"],
    spec: rfc(6585, "5"),
    keywords: ["cookie too large", "header too large", "headers too big"],
  },
  {
    code: 444,
    name: "No Response",
    summary: "nginx closed the connection without sending anything.",
    seenWhen: "Only in nginx logs. Admins return 444 to drop bots or unknown hosts; clients see an empty reply or a reset connection, never the code.",
    whatToDo: "If you're blocked unexpectedly, the server's nginx rules (return 444) are the place to look.",
    source: "nginx",
    keywords: ["empty reply", "connection closed", "blocked"],
  },
  {
    code: 451,
    name: "Unavailable For Legal Reasons",
    summary: "Blocked because of a legal demand, like a court order or government censorship.",
    seenWhen: "Content blocked in some countries, and some sites turning away visitors from regions whose laws they don't comply with.",
    whatToDo: "Nothing technical to fix. Servers can name the blocking authority in a Link header with rel=\"blocked-by\".",
    headers: ["Link"],
    spec: rfc(7725, "3"),
    keywords: ["legal", "censored", "blocked", "gdpr", "geoblocked"],
  },
  {
    code: 499,
    name: "Client Closed Request",
    summary: "The client hung up before nginx could respond.",
    seenWhen: "In nginx logs when users navigate away, requests are cancelled, or client or load balancer timeouts are shorter than the backend's response time.",
    whatToDo: "A few are normal. Many point to a slow backend or client timeouts that are too short.",
    source: "nginx",
    keywords: ["client closed", "cancelled", "aborted"],
  },
  {
    code: 500,
    name: "Internal Server Error",
    summary: "Something broke on the server.",
    seenWhen: "Unhandled exceptions, bad deploys, missing environment variables, database errors.",
    whatToDo: "Server: check logs for the stack trace. Client: retry idempotent requests with backoff, and report it with the request ID if there is one.",
    spec: rfc9110("15.6.1"),
    keywords: ["server error", "crash", "exception", "ise"],
  },
  {
    code: 501,
    name: "Not Implemented",
    summary: "The server doesn't support this method at all.",
    seenWhen: "Unusual methods (like PATCH or PROPFIND) sent to servers that don't know them, or stubbed-out endpoints.",
    whatToDo: "Use a supported method. 405 means only this URL rejects the method; 501 means the whole server doesn't know it.",
    spec: rfc9110("15.6.2"),
    cacheable: true,
    keywords: ["not implemented", "unsupported method"],
  },
  {
    code: 502,
    name: "Bad Gateway",
    summary: "A proxy or gateway got an invalid response from the server behind it.",
    seenWhen: "The app crashed or isn't listening on the port the proxy uses, or it closed a keep-alive connection the load balancer was reusing.",
    whatToDo: "Check the app is running and listening where the proxy points. Set the app's keep-alive timeout longer than the load balancer's idle timeout. 504 means the app was too slow; 502 means it answered badly or not at all.",
    spec: rfc9110("15.6.3"),
    keywords: ["bad gateway", "proxy error", "upstream", "nginx", "load balancer"],
  },
  {
    code: 503,
    name: "Service Unavailable",
    summary: "The server can't handle requests right now: overloaded or down for maintenance.",
    seenWhen: "Traffic spikes, maintenance windows, or load balancers with no healthy targets.",
    whatToDo: "Retry later, honouring Retry-After. Servers should send Retry-After during planned maintenance.",
    headers: ["Retry-After"],
    spec: rfc9110("15.6.4"),
    keywords: ["unavailable", "maintenance", "overloaded", "down", "no healthy"],
  },
  {
    code: 504,
    name: "Gateway Timeout",
    summary: "A proxy or gateway gave up waiting for the server behind it.",
    seenWhen: "Slow queries or long reports behind nginx (proxy_read_timeout defaults to 60 seconds) or a cloud load balancer's timeout.",
    whatToDo: "Speed up the request, or move long work to a background job and return 202 Accepted. Raising the proxy timeout is a stopgap.",
    spec: rfc9110("15.6.5"),
    keywords: ["gateway timeout", "timeout", "upstream timed out", "slow", "proxy"],
  },
  {
    code: 505,
    name: "HTTP Version Not Supported",
    summary: "The server doesn't support the request's HTTP version.",
    seenWhen: "Rarely: malformed request lines, or clients forcing an HTTP version the server doesn't speak.",
    whatToDo: "Let the client negotiate the version, or use HTTP/1.1.",
    spec: rfc9110("15.6.6"),
    keywords: ["http version", "protocol version"],
  },
  {
    code: 506,
    name: "Variant Also Negotiates",
    summary: "A server content negotiation misconfiguration: the chosen variant negotiates again.",
    seenWhen: "Almost never; a server configuration error.",
    whatToDo: "Server admins: fix the transparent content negotiation setup.",
    spec: rfc(2295, "8.1"),
    keywords: ["negotiation", "misconfiguration"],
  },
  {
    code: 507,
    name: "Insufficient Storage",
    summary: "The server has no room to store what the request needs (WebDAV).",
    seenWhen: "Uploads to WebDAV or file sync servers with a full disk or exceeded quota.",
    whatToDo: "Free up space or raise the quota.",
    spec: rfc(4918, "11.5"),
    keywords: ["disk full", "storage", "quota", "webdav"],
  },
  {
    code: 508,
    name: "Loop Detected",
    summary: "The server found an infinite loop while processing the request (WebDAV).",
    seenWhen: "WebDAV binding loops. On shared hosting (CloudLinux), 508 usually means \"Resource Limit Is Reached\" instead.",
    whatToDo: "On shared hosting, the account hit its CPU, memory, or process limits: reduce load or upgrade the plan.",
    spec: rfc(5842, "7.2"),
    keywords: ["loop", "resource limit", "shared hosting", "webdav"],
  },
  {
    code: 510,
    name: "Not Extended",
    summary: "The request needs an HTTP extension the client didn't declare.",
    seenWhen: "Almost never. The extension framework behind it is now historic.",
    whatToDo: "Nothing in practice. Don't use it in new APIs.",
    spec: rfc(2774, "7"),
    deprecated: true,
    keywords: ["extension"],
  },
  {
    code: 511,
    name: "Network Authentication Required",
    summary: "You need to sign in to the network before you can use it.",
    seenWhen: "Captive portals on hotel, airport, and café Wi-Fi.",
    whatToDo: "Open a browser and complete the network's sign-in page.",
    spec: rfc(6585, "6"),
    keywords: ["captive portal", "wifi", "hotspot", "network login"],
  },
  {
    code: 520,
    name: "Web Server Returned an Unknown Error",
    summary: "Cloudflare got an empty, unknown, or unexpected response from the origin.",
    seenWhen: "Origin crashes, resets connections, or sends headers too large for Cloudflare.",
    whatToDo: "Check origin server logs around the time of the error, and make sure the origin isn't resetting Cloudflare's connections.",
    source: "Cloudflare",
    keywords: ["cloudflare", "origin error", "unknown error"],
  },
  {
    code: 521,
    name: "Web Server Is Down",
    summary: "The origin refused Cloudflare's connection.",
    seenWhen: "The origin web server is stopped, or a firewall is blocking Cloudflare's IP ranges.",
    whatToDo: "Make sure the web server is running and allowlist Cloudflare's IP ranges.",
    source: "Cloudflare",
    keywords: ["cloudflare", "origin down", "connection refused"],
  },
  {
    code: 522,
    name: "Connection Timed Out",
    summary: "Cloudflare couldn't complete a TCP connection to the origin in time.",
    seenWhen: "Overloaded origins, firewalls silently dropping Cloudflare's traffic, or a wrong origin IP.",
    whatToDo: "Check the origin IP in DNS, firewall rules for Cloudflare's ranges, and server load.",
    source: "Cloudflare",
    keywords: ["cloudflare", "timeout", "tcp"],
  },
  {
    code: 523,
    name: "Origin Is Unreachable",
    summary: "Cloudflare can't find a route to the origin.",
    seenWhen: "The origin IP in DNS is wrong or changed, or there's a network routing problem.",
    whatToDo: "Check the DNS records in Cloudflare point to the right origin IP.",
    source: "Cloudflare",
    keywords: ["cloudflare", "unreachable", "dns"],
  },
  {
    code: 524,
    name: "A Timeout Occurred",
    summary: "Cloudflare connected to the origin, but it didn't send a response in time.",
    seenWhen: "Long-running requests, like reports or exports, that exceed Cloudflare's proxy read timeout (100 seconds by default).",
    whatToDo: "Move long work to a background job and poll for the result, or speed up the request.",
    source: "Cloudflare",
    keywords: ["cloudflare", "timeout", "slow origin"],
  },
  {
    code: 525,
    name: "SSL Handshake Failed",
    summary: "Cloudflare couldn't complete a TLS handshake with the origin.",
    seenWhen: "SSL mode set to Full or Full (strict) while the origin has no valid TLS setup, or cipher and SNI mismatches.",
    whatToDo: "Configure TLS on the origin (a Cloudflare Origin CA certificate works) or change the SSL mode.",
    source: "Cloudflare",
    keywords: ["cloudflare", "ssl", "tls", "handshake"],
  },
  {
    code: 526,
    name: "Invalid SSL Certificate",
    summary: "The origin's TLS certificate failed validation.",
    seenWhen: "Full (strict) SSL mode with an expired, self-signed, or wrong-hostname certificate on the origin.",
    whatToDo: "Install a valid certificate on the origin (a Cloudflare Origin CA certificate counts).",
    source: "Cloudflare",
    keywords: ["cloudflare", "ssl", "certificate", "expired certificate"],
  },
];

const byCode = new Map(HTTP_STATUSES.map((s) => [s.code, s]));

export function getStatus(code: number): HttpStatus | undefined {
  return byCode.get(code);
}

export function statusClass(code: number): StatusClassId {
  return Math.floor(code / 100) as StatusClassId;
}

const words = (text: string) => text.toLowerCase().split(/[^a-z0-9']+/).filter(Boolean);

/** Score for one query word: 3 for a name word, 2 for a keyword word, 1 for the summary, 0.5 for the notes. */
function tokenScore(token: string, s: HttpStatus): number {
  const starts = (text: string) => words(text).some((w) => w.startsWith(token));
  if (starts(s.name)) return 3;
  if (s.keywords.some(starts)) return 2;
  if (starts(s.summary)) return 1;
  if (starts(s.seenWhen)) return 0.5;
  return 0;
}

/**
 * Finds statuses for a query: an exact code, a class like "4xx", a code prefix like "40", or words.
 * Every word must match; results rank by where the words matched, then by code.
 */
export function searchStatuses(query: string, cls?: number): HttpStatus[] {
  const pool = cls ? HTTP_STATUSES.filter((s) => statusClass(s.code) === cls) : [...HTTP_STATUSES];
  const q = query.trim().toLowerCase();
  if (!q) return pool;
  if (/^\d{3}$/.test(q)) return pool.filter((s) => s.code === Number(q));
  if (/^[1-5]xx$/.test(q)) return pool.filter((s) => statusClass(s.code) === Number(q[0]));
  if (/^\d{1,2}$/.test(q)) return pool.filter((s) => String(s.code).startsWith(q));

  const tokens = words(q);
  if (!tokens.length) return [];
  const scored: { status: HttpStatus; score: number }[] = [];
  for (const status of pool) {
    let score = 0;
    let all = true;
    for (const token of tokens) {
      const s = tokenScore(token, status);
      if (!s) {
        all = false;
        break;
      }
      score += s;
    }
    if (!all) continue;
    // Whole-phrase matches beat scattered word matches.
    if (status.name.toLowerCase().includes(q)) score += 10;
    if (status.keywords.includes(q)) score += 8;
    else if (status.keywords.some((k) => k.includes(q))) score += 4;
    scored.push({ status, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.status.code - b.status.code).map((x) => x.status);
}
