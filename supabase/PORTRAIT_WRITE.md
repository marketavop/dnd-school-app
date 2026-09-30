# IMG-02: portrait-write

Requires the applied IMG-01 migration. No additional SQL, Storage policies or UI.
Service-role credentials stay in Edge Function secrets. The function uses the same
Supabase JS version and CORS/session header conventions as the map functions.

## Request

POST multipart/form-data to `/functions/v1/portrait-write`:

- `x-session-token`: existing 64-character application session token.
- `apikey`: project publishable key, as with the map endpoint.
- `action`: `upload` or `remove`.
- `entity_type`: `character` or `npc`.
- `entity_id`: UUID.
- `file`: required for upload; absent for remove.

The browser must let its HTTP client set the multipart boundary. No client-supplied
object path, owner or role is used. The original filename never becomes a Storage key.
JPEG extensions `.jpg` and `.jpeg` are accepted; stored JPEG paths end in `.jpg`.
MIME and extension must match the detected content. Files with missing/mismatched
MIME or extension are rejected, even if their bytes look like an image.

`portrait_reference(..., p_for_write=true)` authorizes the supplied session and
entity in PostgreSQL before any Storage write. `portrait_change_reference` checks
authorization again and performs the expected-old-path update. No separate role
or ownership implementation lives in the Edge Function.

## Lifecycle and responses

Upload: validate -> unique UUID object with `upsert:false` -> DB compare-and-swap
-> remove old object. Remove: DB compare-and-swap to NULL -> remove old object.
Success: HTTP 200 `{ object_path: string | null, cleanup_pending: boolean }`.
A cleanup failure is logged, never reverses the DB update, and sets cleanup_pending.

- 400: invalid request or missing/empty file.
- 403: missing/invalid session or denied entity write.
- 409: reference conflict; do not overwrite the winner or blindly retry.
- 413: file over 5 MiB or either dimension over 2048; request envelope is also
  bounded to 5 MiB + 64 KiB while streaming, regardless of Content-Length.
- 415: unsupported/malformed image, mismatched MIME/extension or wrong request type.
- 422: definite DB rejection other than authorization/conflict.
- 502/503: service failure or ambiguous result.

Confirmed SQL rejection cleans the new object best-effort. Lost/malformed replies
and unknown DB errors return 503 with `outcome_unknown:true` and keep both objects:
a commit may have occurred even if its reply was lost. Reload the authorized
reference before retrying; logged paths permit later investigation/cleanup.
Upload errors can likewise leave an orphan. No cleanup queue or retry job is added.
Logs do not include session tokens, credentials, file content or signed URLs.

## Validation boundaries

PNG: full eight-byte signature, IHDR dimensions and bounded chunks through IDAT/IEND.
JPEG: SOI/EOI, bounded segments, SOF dimensions and scan header.
WebP: RIFF/WEBP size and bounded/padded chunks; VP8 and VP8L dimensions, VP8X canvas
consistency, and ANMF frame bounds for animation. Layout follows the
[WebP container specification](https://developers.google.com/speed/webp/docs/riff_container).

This checks signatures, container/header structure and declared dimensions, not
every compressed pixel or PNG CRC. A corrupt compressed stream may still pass and
fail to render. No codec, pixel decoding, conversion, cropping or resizing is added.
The bucket's MIME/size limits remain an additional check, not authorization.

## Verification / later deployment

Run `node --test tests/portrait-write.cjs`. Tests execute the actual handler with
mocked Supabase RPC/Storage responses and Web API Request/FormData/File objects.
Image fixtures include tiny PNG/JPEG/WebP samples and synthetic container headers for edge cases;
they do not prove codec decoding. Authorization enforcement itself is covered by
IMG-01 SQL tests; these tests check the server calls and obeys that contract.

No deployment is performed by IMG-02. At deployment, use the project's custom-session
gateway setup: a publishable key and x-session-token are not a Supabase Auth JWT.
Configure this function with gateway JWT verification disabled (for example the
deployment CLI's `--no-verify-jwt` option); application authorization remains mandatory
inside the function. Verify actual CORS, Deno execution, Storage access and RPC grants
in a deployed test environment before connecting UI.
