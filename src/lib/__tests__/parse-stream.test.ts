import { describe, expect, test } from "bun:test";
import {
  isPermissionDeniedError,
  isRateLimitError,
  parseError,
} from "../parse-error";
import {
  consumeSSEStream,
  parseSSEError,
  parseSSEFrame,
} from "../parse-stream";

describe("parseError — new classifications", () => {
  test("PERMISSION_DENIED envelope → isPermissionDenied, not isAuth", () => {
    const p = parseError({
      error: {
        code: "PERMISSION_DENIED",
        type: "permission_error",
        message: "no",
      },
    });
    expect(p.isPermissionDenied).toBe(true);
    expect(p.isAuth).toBe(false);
    expect(
      isPermissionDeniedError({ error: { code: "INSUFFICIENT_SCOPE" } }),
    ).toBe(true);
  });

  test("RATE_LIMITED envelope → isRateLimit", () => {
    expect(isRateLimitError({ error: { code: "RATE_LIMITED" } })).toBe(true);
    expect(
      parseError({ error: { type: "rate_limit_error", code: "X" } })
        .isRateLimit,
    ).toBe(true);
  });

  test("status-only fallbacks classify 403 and 429", () => {
    expect(parseError({ status: 403 }).isPermissionDenied).toBe(true);
    expect(parseError({ status: 429 }).isRateLimit).toBe(true);
  });
});

describe("parseSSEError", () => {
  test("classifies an event: error frame carrying the canonical envelope", () => {
    const raw =
      'event: error\ndata: {"error":{"code":"INSUFFICIENT_CREDITS","type":"insufficient_credits_error","message":"broke"}}';
    const p = parseSSEError(raw);
    expect(p).not.toBeNull();
    expect(p!.code).toBe("INSUFFICIENT_CREDITS");
    expect(p!.isInsufficientCredits).toBe(true);
  });

  test("classifies a data-only frame that carries an error envelope", () => {
    const frame = parseSSEFrame(
      'data: {"error":{"code":"SPENDING_LIMIT_EXCEEDED"}}',
    );
    expect(parseSSEError(frame!)!.isSpendingLimit).toBe(true);
  });

  test("returns null for a normal delta frame and for [DONE]", () => {
    expect(
      parseSSEError('data: {"choices":[{"delta":{"content":"hi"}}]}'),
    ).toBeNull();
    expect(parseSSEError("data: [DONE]")).toBeNull();
  });
});

describe("consumeSSEStream", () => {
  function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(enc.encode(c));
        controller.close();
      },
    });
  }

  test("delivers data frames to onData and a terminal error to onError", async () => {
    const data: string[] = [];
    let err: any = null;
    await consumeSSEStream(
      streamOf([
        'data: {"choices":[{"delta":{"content":"a"}}]}\n\n',
        'event: error\ndata: {"error":{"code":"PAYMENT_DECLINED","type":"payment_declined_error","message":"nope"}}\n\n',
      ]),
      { onData: (d) => data.push(d), onError: (e) => (err = e) },
    );
    expect(data.length).toBe(1);
    expect(err).not.toBeNull();
    expect(err.code).toBe("PAYMENT_DECLINED");
    expect(err.isPaymentDeclined).toBe(true);
  });

  test("handles a null body without throwing", async () => {
    let done = false;
    await consumeSSEStream(null, { onDone: () => (done = true) });
    expect(done).toBe(true);
  });
});
