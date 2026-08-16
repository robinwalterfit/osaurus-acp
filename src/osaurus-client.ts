/**
 * SPDX-FileCopyrightText: 2026 Robin Walter <hello@robinwalter.me>
 * SPDX-License-Identifier: Apache-2.0
 *
 * Minimal client for the Osaurus HTTP API.
 *
 * Wraps `POST /agents/{id}/run`, which accepts an OpenAI-style
 * ChatCompletionRequest and streams back Server-Sent Events containing
 * `chat.completion.chunk` JSON objects, terminated by `data: [DONE]`.
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

export interface ChatMessage {
  content: string;
  role: "assistant" | "system" | "user";
}

export interface RunAgentOptions {
  /** Groups requests into a server-side conversation (persisted history). */
  sessionId?: string;
  /** Aborts the underlying HTTP request. */
  signal?: AbortSignal;
}

export type OsaurusChunk =
  | { kind: "content"; text: string }
  | { kind: "reasoning"; text: string }
  | { kind: "prefill"; stage: string; completedUnitCount: number; totalUnitCount: number; detail?: string }
  | { kind: "tool_trace"; phase: string; name: string; call_id: string; is_error?: boolean; end_run?: boolean };

export interface OsaurusClientOptions {
  /** Base URL of the Osaurus server, e.g. "http://127.0.0.1:1337". */
  baseUrl: string;
  /** Injectable for testing. Defaults to global fetch. */
  fetch?: typeof fetch;
}

/** Thrown when the Osaurus server responds with a non-2xx status. */
export class OsaurusHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "OsaurusHttpError";
  }
}

/** Thrown when the Osaurus SSE stream carries an in-band error chunk. */
export class OsaurusStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OsaurusStreamError";
  }
}

export class OsaurusClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: OsaurusClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchFn = options.fetch ?? fetch;
  }

  /**
   * Runs an agent turn and yields assistant text deltas as they stream in.
   *
   * The endpoint mirrors OpenAI's stateless `/chat/completions` convention, so the caller must send the full
   * conversation history as the `messages` array on every turn. `session_id` is passed through as opaque metadata for
   * Osaurus' memory features, but history correctness must not depend on it.
   */
  async *runAgent(
    agentId: string,
    messages: ChatMessage[],
    options: RunAgentOptions = {},
  ): AsyncGenerator<string, void, undefined> {
    const response = await this.fetchFn(`${this.baseUrl}/agents/${encodeURIComponent(agentId)}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        // TODO(hello@robinwalter.me): Could here a model be selected via Zed to use this model instead of the default agent's model?
        model: "",
        messages,
        stream: true,
        ...(options.sessionId ? { session_id: options.sessionId } : {}),
      }),
      signal: options.signal ?? null,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new OsaurusHttpError(
        response.status,
        `Osaurus request failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      );
    }
    if (!response.body) {
      throw new OsaurusStreamError("Osaurus response has no body to stream");
    }

    for await (const chunk of parseSseChunks(response.body)) {
      if (chunk.kind === "content") yield chunk.text;
      // We ignore tool_trace / reasoning / prefill in this phase
    }
  }
}

/**
 * Parses an OpenAI-style SSE byte stream and yields the text content of each `choices[0].delta.content` field.
 * `[DONE]` ends the stream.
 */
export async function* parseSseChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<OsaurusChunk, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line.
      let boundary: number;
      while ((boundary = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, "");
        const result = yield* parseSseChunkFromEvent(rawEvent);
        if (result.done) return;
      }
    }
    buffer += decoder.decode(); // flush trailing multi-byte
    // Flush any trailing event not terminated by a blank line.
    if (buffer.trim().length > 0) {
      yield* parseSseChunkFromEvent(buffer);
    }
  } finally {
    // Release the underlying connection on early exit ([DONE], consumer break, or error), not just on natural stream end.
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function* parseSseChunkFromEvent(rawEvent: string): Generator<OsaurusChunk, { done: boolean }, undefined> {
  // An event may contain multiple `data:` lines; concatenate per SSE spec.
  const data = rawEvent
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).replace(/^ /, ""))
    .join("\n");

  if (data.length === 0) return { done: false };
  if (data === "[DONE]") return { done: true };

  let chunk: Record<string, unknown>;
  try {
    chunk = JSON.parse(data);
  } catch {
    return { done: false }; // Ignore non-JSON keep-alives / comments.
  }

  // 1. In-band error
  const error = chunk.error as { message?: string } | undefined;
  if (error) {
    throw new OsaurusStreamError(typeof error.message === "string" ? error.message : "Osaurus reported a stream error");
  }

  // 2. Tool trace (Osaurus-specific, no standard ChatCompletionChunk-Field)
  const toolTrace = chunk.osaurus_agent_tool as Record<string, unknown> | undefined;
  if (toolTrace) {
    yield {
      kind: "tool_trace",
      phase: String(toolTrace.phase ?? ""),
      name: String(toolTrace.name ?? ""),
      call_id: String(toolTrace.call_id ?? ""),
      ...(toolTrace.is_error !== undefined ? { is_error: Boolean(toolTrace.is_error) } : {}),
      ...(toolTrace.end_run !== undefined ? { end_run: Boolean(toolTrace.end_run) } : {}),
    };
    return { done: false };
  }

  // 3. Prefill progress
  const prefill = chunk.osaurus_prefill as Record<string, unknown> | undefined;
  if (prefill) {
    yield {
      kind: "prefill",
      stage: String(prefill.stage ?? ""),
      completedUnitCount: Number(prefill.completedUnitCound ?? 0),
      totalUnitCount: Number(prefill.totalUnitCount ?? 0),
      ...(typeof prefill.detail === "string" ? { detail: prefill.detail } : {}),
    };
    return { done: false };
  }

  // 4. Standard ChatCompletionChunk - can be one of content OR reasoning
  const choices = chunk.choices as Array<{ delta?: Record<string, unknown>; finish_reason?: string }> | undefined;
  const delta = choices?.[0]?.delta;

  if (delta) {
    const content = delta.content;
    if (typeof content === "string" && content.length > 0) {
      yield { kind: "content", text: content };
    }

    const reasoning = delta.reasoning_content ?? delta.reasoning;
    if (typeof reasoning === "string" && reasoning.length > 0) {
      yield { kind: "reasoning", text: reasoning };
    }
  }

  return { done: false };
}
