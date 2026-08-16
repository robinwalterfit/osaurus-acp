/**
 * SPDX-FileCopyrightText: 2026 Robin Walter <hello@robinwalter.me>
 * SPDX-License-Identifier: Apache-2.0
 *
 * Copyright Copyright 2026 Robin Walter <hello@robinwalter.me>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { describe, expect, test } from "bun:test";

import {
  OsaurusChunk,
  OsaurusClient,
  OsaurusHttpError,
  OsaurusStreamError,
  parseSseChunks,
} from "../src/osaurus-client.js";

function sseStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });
}

function chunk(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

async function collect(stream: AsyncGenerator<OsaurusChunk, void, undefined>): Promise<OsaurusChunk[]> {
  const out: OsaurusChunk[] = [];
  for await (const text of stream) out.push(text);
  return out;
}

async function collectToString(stream: AsyncGenerator<string, void, undefined>): Promise<string[]> {
  const out: string[] = [];
  for await (const text of stream) out.push(text);
  return out;
}

describe("parseSseChunks", () => {
  test("yields delta content and stops at [DONE]", async () => {
    const stream = sseStream([chunk("Hello"), chunk(" world"), "data: [DONE]\n\n", chunk("ignored")]);
    expect(await collect(parseSseChunks(stream))).toEqual([
      { kind: "content", text: "Hello" },
      { kind: "content", text: " world" },
    ]);
  });

  test("handles events split across network chunks", async () => {
    const payload = chunk("split");
    const stream = sseStream([payload.slice(0, 10), payload.slice(10)]);
    expect(await collect(parseSseChunks(stream))).toEqual([{ kind: "content", text: "split" }]);
  });

  test("handles CRLF line endings", async () => {
    const stream = sseStream([chunk("a").replaceAll("\n", "\r\n"), chunk("b").replaceAll("\n", "\r\n")]);
    expect(await collect(parseSseChunks(stream))).toEqual([
      { kind: "content", text: "a" },
      { kind: "content", text: "b" },
    ]);
  });

  test("skips non-text chunks (empty deltas, keep-alives)", async () => {
    const stream = sseStream([
      `data: ${JSON.stringify({ choices: [{ delta: {} }] })}\n\n`,
      ": keep-alive\n\n",
      "data: not-json\n\n",
      chunk("real"),
    ]);
    expect(await collect(parseSseChunks(stream))).toEqual([{ kind: "content", text: "real" }]);
  });

  test("throws OsaurusStreamError on in-band error chunks", async () => {
    const stream = sseStream([
      chunk("partial"),
      `data: ${JSON.stringify({ error: { message: "model exploded" } })}\n\n`,
    ]);
    await expect(collect(parseSseChunks(stream))).rejects.toThrow(new OsaurusStreamError("model exploded"));
  });
});

describe("OsaurusClient.runAgent", () => {
  function mockFetch(body: string[], init?: { status?: number; capture?: (req: RequestInit, url: string) => void }) {
    return (async (url: string | URL | Request, reqInit?: RequestInit) => {
      init?.capture?.(reqInit ?? {}, String(url));
      const status = init?.status ?? 200;
      return new Response(sseStream(body), {
        status,
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as unknown as typeof fetch;
  }

  test("posts a ChatCompletionRequest to /agents/{id}/run and streams deltas", async () => {
    let captured: { req: RequestInit; url: string } | undefined;
    const client = new OsaurusClient({
      baseUrl: "http://localhost:1337/",
      fetch: mockFetch([chunk("hi"), "data: [DONE]\n\n"], {
        capture: (req, url) => (captured = { req, url }),
      }),
    });

    const deltas: string[] = await collectToString(
      client.runAgent("default", [{ role: "user", content: "Hello there" }], { sessionId: "s-1" }),
    );

    expect(deltas).toEqual(["hi"]);
    expect(captured?.url).toBe("http://localhost:1337/agents/default/run");
    expect(captured?.req.method).toBe("POST");
    const body = JSON.parse(String(captured?.req.body));
    expect(body).toEqual({
      model: "",
      messages: [{ role: "user", content: "Hello there" }],
      stream: true,
      session_id: "s-1",
    });
  });

  test("sends the full messages array and session_id in the request body", async () => {
    let captured: RequestInit | undefined;
    const client = new OsaurusClient({
      baseUrl: "http://localhost:1337/",
      fetch: mockFetch(["data: [DONE]\n\n"], { capture: (req) => (captured = req) }),
    });

    const history = [
      { role: "user" as const, content: "first" },
      { role: "assistant" as const, content: "reply" },
      { role: "user" as const, content: "second" },
    ];
    await collectToString(client.runAgent("default", history, { sessionId: "s-1" }));

    const body = JSON.parse(String(captured?.body));
    expect(body.messages).toEqual(history);
    expect(body.session_id).toBe("s-1");
  });

  test("omits session_id when no session is given", async () => {
    let captured: RequestInit | undefined;
    const client = new OsaurusClient({
      baseUrl: "http://localhost:1337/",
      fetch: mockFetch(["data: [DONE]\n\n"], { capture: (req) => (captured = req) }),
    });

    await collectToString(client.runAgent("abc-123", [{ role: "user", content: "hi" }]));
    expect(JSON.parse(String(captured?.body))).not.toHaveProperty("session_id");
  });

  test("throws OsaurusHttpError on non-2xx responses", async () => {
    const client = new OsaurusClient({
      baseUrl: "http://localhost:1337/",
      fetch: mockFetch(["unknown agent"], { status: 404 }),
    });
    await expect(collectToString(client.runAgent("nope", [{ role: "user", content: "hi" }]))).rejects.toThrow(
      OsaurusHttpError,
    );
  });
});
