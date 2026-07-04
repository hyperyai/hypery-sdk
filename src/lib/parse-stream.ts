import type { ParsedError } from "../types";
import { parseError } from "./parse-error";

/**
 * Streaming (SSE) error classification for the gateway's chat/completions stream.
 *
 * A pre-stream denial arrives as a normal HTTP 402/429/403 with a JSON body —
 * `parseError` already handles that. But a failure AFTER the stream has started
 * (e.g. a billing/finalize error) is delivered as an SSE `event: error` frame,
 * which a fetch-stream consumer must parse itself. These helpers surface that
 * terminal error in the EXACT same classified shape as a non-streaming error,
 * because the gateway now emits the canonical `{ error: { code, type, message } }`
 * envelope inside the frame's `data:` (see lib/errors/api-error.ts).
 */

export interface SSEEvent {
  /** The `event:` name, if the frame set one (e.g. `error`). */
  event?: string;
  /** The concatenated `data:` payload. */
  data: string;
}

/** Parse a raw SSE frame block (the text between blank-line delimiters). */
export function parseSSEFrame(block: string): SSEEvent | null {
  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (!event && dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

/**
 * If a frame is a terminal error — either `event: error`, or a `data:` payload
 * carrying the canonical `{ error: { code } }` envelope — return the classified
 * ParsedError (identical to `parseError()` for a non-streaming failure).
 * Returns null for a normal data frame or the `[DONE]` sentinel.
 */
export function parseSSEError(frame: SSEEvent | string): ParsedError | null {
  const f = typeof frame === "string" ? parseSSEFrame(frame) : frame;
  if (!f) return null;
  if (f.data === "[DONE]") return null;

  const isErrorEvent = f.event === "error";
  let payload: unknown;
  try {
    payload = JSON.parse(f.data);
  } catch {
    // Non-JSON data on an error frame — still surface it as a classified error.
    return isErrorEvent ? parseError({ message: f.data }) : null;
  }

  const hasEnvelope =
    !!payload &&
    typeof payload === "object" &&
    typeof (payload as any).error === "object" &&
    (payload as any).error !== null &&
    "code" in (payload as any).error;

  return isErrorEvent || hasEnvelope ? parseError(payload) : null;
}

export interface SSEStreamHandlers {
  /** Called with each normal SSE `data:` payload (e.g. an OpenAI delta chunk). */
  onData?: (data: string) => void;
  /** Called ONCE with a classified error if the stream ends in an error frame. */
  onError?: (error: ParsedError) => void;
  /** Called when the stream completes (after `[DONE]` or the body closing). */
  onDone?: () => void;
}

/**
 * Consume a streaming Response body (`fetch(...).body`), splitting it into SSE
 * frames. Normal data frames go to `onData`; a terminal `event: error` frame is
 * classified and delivered to `onError` (NOT thrown), so a consumer using raw
 * fetch-stream parsing gets the same `ParsedError` it would from a non-streaming
 * call and can drive the same billing/auth modal. Resolves when the stream ends.
 */
export async function consumeSSEStream(
  body: ReadableStream<Uint8Array> | null | undefined,
  handlers: SSEStreamHandlers,
): Promise<void> {
  if (!body) {
    handlers.onDone?.();
    return;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const frame = parseSSEFrame(block);
        if (!frame) continue;

        const err = parseSSEError(frame);
        if (err) {
          handlers.onError?.(err);
          continue;
        }
        if (frame.data === "[DONE]") continue;
        handlers.onData?.(frame.data);
      }
    }
  } finally {
    reader.releaseLock();
  }
  handlers.onDone?.();
}
