# Streaming (SSE) errors

A denial before a stream starts is a normal HTTP 402/429/403 with a JSON body,
which [`parseError`](./ERRORS.md#parseerror) handles. A failure after the stream
has started arrives as an SSE `event: error` frame whose `data:` is the same
`{ error: { code, type, message } }` envelope. These helpers classify that frame
into the same `ParsedError`, so one billing/auth UI handles both.

> Back to [README](../README.md) · Error reference: [ERRORS.md](./ERRORS.md)

## `consumeSSEStream`

`consumeSSEStream(body, handlers): Promise<void>`

Reads a `fetch` response body, splits it on blank lines into frames, and
dispatches them. Resolves when the stream ends. Error frames are delivered to
`onError`, not thrown. `[DONE]` is skipped.

```ts
import { consumeSSEStream, useAuth } from '@hyperyai/sdk';

const { authenticatedFetch, gatewayUrl } = useAuth();

const res = await authenticatedFetch(`${gatewayUrl}/api/v1/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ model, messages, stream: true }),
});

await consumeSSEStream(res.body, {
  onData: (data) => appendDelta(JSON.parse(data)),
  onError: (err) => { if (err.isInsufficientCredits) openFunds(); },
  onDone: () => setStreaming(false),
});
```

| Param | Type | Description |
| --- | --- | --- |
| `body` | `ReadableStream<Uint8Array> \| null \| undefined` | Response body. `null`/`undefined` calls `onDone` immediately. |
| `handlers` | `SSEStreamHandlers` | See below. |

`SSEStreamHandlers`:

| Field | Type | Description |
| --- | --- | --- |
| `onData` | `(data: string) => void` | Each normal `data:` payload. |
| `onError` | `(error: ParsedError) => void` | A classified error frame. |
| `onDone` | `() => void` | After the body closes. |

## `parseSSEFrame`

`parseSSEFrame(block: string): SSEEvent | null`

Parses one frame (the text between blank lines). Multiple `data:` lines are
joined with `\n`; one leading space after `data:` is removed. Returns `null`
when the block has neither `event:` nor `data:`.

```ts
parseSSEFrame('event: error\ndata: {"error":{"code":"INSUFFICIENT_CREDITS"}}');
// { event: 'error', data: '{"error":{"code":"INSUFFICIENT_CREDITS"}}' }
```

`SSEEvent`: `{ event?: string; data: string }`.

## `parseSSEError`

`parseSSEError(frame: SSEEvent | string): ParsedError | null`

Returns a `ParsedError` when the frame is `event: error` or its JSON `data`
carries an `{ error: { code } }` envelope. Non-JSON data on an `event: error`
frame becomes a `ParsedError` with that text as the message. Returns `null` for
normal frames and `[DONE]`.

```ts
import { parseSSEError } from '@hyperyai/sdk';

const err = parseSSEError(rawBlock);
if (err?.isSpendingLimit) showLimitAlert(err);
```
