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

import type { AgentSideConnection, ContentBlock, SessionNotification } from "@zed-industries/agent-client-protocol";

import { OsaurusAcpAgent, promptToText } from "../src/agent.js";
import { type ChatMessage, OsaurusClient } from "../src/osaurus-client.js";

type SessionUpdate = SessionNotification["update"];

function fakeConnection() {
  const updates: SessionUpdate[] = [];
  const connection = {
    sessionUpdate: async (params: SessionNotification) => {
      updates.push(params.update);
    },
  } as unknown as AgentSideConnection;
  return { connection, updates };
}

function sseFetch(events: string[]): typeof fetch {
  return (async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) controller.enqueue(encoder.encode(event));
        controller.close();
      },
    });
    return new Response(body, { status: 200 });
  }) as unknown as typeof fetch;
}

function textChunk(text: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

function makeAgent(events: string[]) {
  const { connection, updates } = fakeConnection();
  const client = new OsaurusClient({
    baseUrl: "[URL_34]",
    fetch: sseFetch(events),
  });
  const agent = new OsaurusAcpAgent({ client, agentId: "default" }, connection);
  return { agent, updates };
}

/** Builds an agent whose client records every `messages` array passed to runAgent. */
function makeRecordingAgent(events: string[]) {
  const { connection, updates } = fakeConnection();
  const sent: ChatMessage[][] = [];
  const client = new OsaurusClient({
    baseUrl: "http://localhost:1337",
    fetch: sseFetch(events),
  });
  const originalRun = client.runAgent.bind(client);
  client.runAgent = (agentId, messages, options) => {
    sent.push([...messages]); // snapshot, since the caller mutates the array in place
    return originalRun(agentId, messages, options);
  };
  const agent = new OsaurusAcpAgent({ client, agentId: "default" }, connection);
  return { agent, updates, sent };
}

describe("promptToText", () => {
  test("joins text blocks with newlines", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "first" },
      { type: "text", text: "second" },
    ];
    expect(promptToText(blocks)).toBe("first\nsecond");
  });

  test("inlines resource links as markdown references", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "explain this" },
      { type: "resource_link", name: "main.ts", uri: "file:///repo/main.ts" },
    ];
    expect(promptToText(blocks)).toBe("explain this\n[main.ts](file:///repo/main.ts)");
  });

  test("inlines embedded text resources", () => {
    const blocks: ContentBlock[] = [
      {
        type: "resource",
        resource: { uri: "file:///repo/a.ts", mimeType: "text/plain", text: "const a = 1;" },
      },
    ];
    expect(promptToText(blocks)).toBe("const a = 1;");
  });
});

describe("OsaurusAcpAgent", () => {
  test("initialize negotiates the protocol version and declares no auth", async () => {
    const { agent } = makeAgent([]);
    const response = await agent.initialize({ protocolVersion: 1 });
    expect(response.protocolVersion).toBe(1);
    expect(response.authMethods).toEqual([]);
    expect(response.agentCapabilities?.loadSession).toBe(false);
  });

  test("prompt streams SSE deltas as agent_message_chunk updates", async () => {
    const { agent, updates } = makeAgent([textChunk("Hello"), textChunk("!"), "data: [DONE]\n\n"]);
    const { sessionId } = await agent.newSession({ cwd: "/tmp", mcpServers: [] });

    const response = await agent.prompt({
      sessionId,
      prompt: [{ type: "text", text: "Hi" }],
    });

    expect(response.stopReason).toBe("end_turn");
    expect(updates).toEqual([
      { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hello" } },
      { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "!" } },
    ]);
  });

  test("prompt rejects unknown sessions", async () => {
    const { agent } = makeAgent([]);
    await expect(agent.prompt({ sessionId: "missing", prompt: [{ type: "text", text: "Hi" }] })).rejects.toThrow(
      "Unknown session",
    );
  });

  test("prompt rejects a second concurrent turn on the same session", async () => {
    // A stream that stays open until the abort signal fires.
    const hangingFetch = (async (_url: unknown, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener("abort", () => {
            controller.error(new DOMException("The operation was aborted.", "AbortError"));
          });
        },
      });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;

    const { connection } = fakeConnection();
    const client = new OsaurusClient({
      baseUrl: "http://localhost:1337",
      fetch: hangingFetch,
    });
    const agent = new OsaurusAcpAgent({ client, agentId: "default" }, connection);
    const { sessionId } = await agent.newSession({ cwd: "/tmp", mcpServers: [] });

    const firstTurn = agent.prompt({ sessionId, prompt: [{ type: "text", text: "one" }] });
    await expect(agent.prompt({ sessionId, prompt: [{ type: "text", text: "two" }] })).rejects.toThrow(
      "already has a prompt turn in progress",
    );

    await agent.cancel({ sessionId });
    expect((await firstTurn).stopReason).toBe("cancelled");
  });

  test("cancel aborts the in-flight turn and resolves as cancelled", async () => {
    // A stream that never terminates on its own; only the abort ends it.
    const hangingFetch = (async (_url: unknown, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          init?.signal?.addEventListener("abort", () => {
            controller.error(new DOMException("The operation was aborted.", "AbortError"));
          });
        },
      });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;

    const { connection } = fakeConnection();
    const client = new OsaurusClient({ baseUrl: "http://localhost:1337", fetch: hangingFetch });
    const agent = new OsaurusAcpAgent({ client, agentId: "default" }, connection);
    const { sessionId } = await agent.newSession({ cwd: "/tmp", mcpServers: [] });

    const promptPromise = agent.prompt({
      sessionId,
      prompt: [{ type: "text", text: "Hi" }],
    });
    await agent.cancel({ sessionId });

    expect((await promptPromise).stopReason).toBe("cancelled");
  });

  test("sends full history on the second turn (user+assistant+user)", async () => {
    const { agent, sent } = makeRecordingAgent([
      textChunk("hi"),
      "data: [DONE]\n\n",
      textChunk("yo"),
      "data: [DONE]\n\n",
    ]);
    const { sessionId } = await agent.newSession({ cwd: "/tmp", mcpServers: [] });

    await agent.prompt({ sessionId, prompt: [{ type: "text", text: "hello" }] });
    await agent.prompt({ sessionId, prompt: [{ type: "text", text: "world" }] });

    expect(sent[0]).toEqual([{ role: "user", content: "hello" }]);
    expect(sent[1]).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
      { role: "user", content: "world" },
    ]);
  });

  test("appends the assistant reply as role:assistant after a successful turn", async () => {
    const { agent, sent } = makeRecordingAgent([textChunk("ok"), "data: [DONE]\n\n", "data: [DONE]\n\n"]);
    const { sessionId } = await agent.newSession({ cwd: "/tmp", mcpServers: [] });

    await agent.prompt({ sessionId, prompt: [{ type: "text", text: "first" }] });
    await agent.prompt({ sessionId, prompt: [{ type: "text", text: "second" }] });

    expect(sent[1]?.[1]).toEqual({ role: "assistant", content: "ok" });
  });

  test("rolls back the user message when the turn errors", async () => {
    const { agent, sent } = makeRecordingAgent([textChunk("partial"), "data: [DONE]\n\n"]);
    const { sessionId } = await agent.newSession({ cwd: "/tmp", mcpServers: [] });

    // First turn succeeds so the transcript has a committed assistant turn.
    await agent.prompt({ sessionId, prompt: [{ type: "text", text: "first" }] });

    // Second turn errors mid-stream.
    const erroringFetch = (async () => {
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(textChunk("boom")));
          controller.error(new Error("stream failed"));
        },
      });
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;
    const { connection } = fakeConnection();
    const client = new OsaurusClient({ baseUrl: "http://localhost:1337", fetch: erroringFetch });
    const agent2 = new OsaurusAcpAgent({ client, agentId: "default" }, connection);
    const s2 = (await agent2.newSession({ cwd: "/tmp", mcpServers: [] })).sessionId;

    await expect(agent2.prompt({ sessionId: s2, prompt: [{ type: "text", text: "boom" }] })).rejects.toThrow();

    // A subsequent successful turn sends only its own user message (no unpaired user turn).
    const { agent: agent3, sent: sent3 } = makeRecordingAgent([textChunk("fine"), "data: [DONE]\n\n"]);
    const s3 = (await agent3.newSession({ cwd: "/tmp", mcpServers: [] })).sessionId;
    await agent3.prompt({ sessionId: s3, prompt: [{ type: "text", text: "after" }] });
    expect(sent3[0]).toEqual([{ role: "user", content: "after" }]);
  });

  test("isolates history between sessions", async () => {
    const { agent, sent } = makeRecordingAgent([
      textChunk("a"),
      "data: [DONE]\n\n",
      textChunk("b"),
      "data: [DONE]\n\n",
    ]);
    const a = (await agent.newSession({ cwd: "/tmp", mcpServers: [] })).sessionId;
    const b = (await agent.newSession({ cwd: "/tmp", mcpServers: [] })).sessionId;

    await agent.prompt({ sessionId: a, prompt: [{ type: "text", text: "A1" }] });
    await agent.prompt({ sessionId: b, prompt: [{ type: "text", text: "B1" }] });
    await agent.prompt({ sessionId: a, prompt: [{ type: "text", text: "A2" }] });

    // Session A's third turn must not include session B's history.
    expect(sent[2]).toEqual([
      { role: "user", content: "A1" },
      { role: "assistant", content: "a" },
      { role: "user", content: "A2" },
    ]);
  });
});
