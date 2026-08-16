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
import {
  type Agent,
  type AgentSideConnection,
  type AuthenticateRequest,
  type CancelNotification,
  type ContentBlock,
  type InitializeRequest,
  type InitializeResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  PROTOCOL_VERSION,
  type PromptRequest,
  type PromptResponse,
} from "@zed-industries/agent-client-protocol";

import { type ChatMessage, OsaurusClient } from "./osaurus-client.js";

export interface OsaurusAcpAgentOptions {
  /** Osaurus agent UUID, or the alias "default" for the built-in agent. */
  agentId: string;
  client: OsaurusClient;
}

interface SessionState {
  /** AbortController for the in-flight prompt turn, if any. */
  currentTurn: AbortController | null;
  /** Full conversation history for this session, sent on every turn. */
  messages: ChatMessage[];
}

/**
 * ACP agent that forwards prompt turns to an Osaurus agent via `POST /agents/{id}/run` and streams the SSE text deltas
 * back to the client as `agent_message_chunk` session updates.
 *
 * Conversation history is kept client-side per ACP session and the full `messages` array is sent on every turn,
 * matching the stateless `/chat/completions` convention. The ACP session id is also passed as the Osaurus `session_id`
 * for Osaurus' memory features, but history correctness does not depend on it.
 */
export class OsaurusAcpAgent implements Agent {
  private readonly sessions = new Map<string, SessionState>();

  constructor(
    private readonly options: OsaurusAcpAgentOptions,
    private readonly connection: AgentSideConnection,
  ) {}

  async initialize(_params: InitializeRequest): Promise<InitializeResponse> {
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: { loadSession: false },
      authMethods: [],
    };
  }

  async newSession(_params: NewSessionRequest): Promise<NewSessionResponse> {
    const sessionId = crypto.randomUUID();
    this.sessions.set(sessionId, { currentTurn: null, messages: [] });
    return { sessionId };
  }

  // No auth methods are advertised in `initialize`, so this is never called by a compliant client.
  async authenticate(_params: AuthenticateRequest): Promise<void> {}

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    const session = this.sessions.get(params.sessionId);
    if (!session) {
      throw new Error(`Unknown session: ${params.sessionId}`);
    }
    if (session.currentTurn) {
      throw new Error(`Session ${params.sessionId} already has a prompt turn in progress`);
    }

    const message = promptToText(params.prompt);
    const turn = new AbortController();
    session.currentTurn = turn;

    // Append the user message up front; roll it back on failure/cancel so the transcript never holds an unpaired user
    // turn.
    session.messages.push({ role: "user", content: message });

    try {
      const deltas = this.options.client.runAgent(this.options.agentId, [...session.messages], {
        sessionId: params.sessionId,
        signal: turn.signal,
      });

      let reply = "";
      for await (const text of deltas) {
        if (turn.signal.aborted) break;
        reply += text;
        await this.connection.sessionUpdate({
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text },
          },
        });
      }

      if (turn.signal.aborted) {
        session.messages.pop(); // roll back the unpaired user turn
        return { stopReason: "cancelled" };
      }

      // Commit the assistant reply so the model sees its own prior output.
      session.messages.push({ role: "assistant", content: reply });
      return { stopReason: "end_turn" };
    } catch (error) {
      session.messages.pop(); // roll back the unpaired user turn
      if (turn.signal.aborted) {
        return { stopReason: "cancelled" };
      }
      throw error;
    } finally {
      if (session.currentTurn === turn) {
        session.currentTurn = null;
      }
    }
  }

  async cancel(params: CancelNotification): Promise<void> {
    this.sessions.get(params.sessionId)?.currentTurn?.abort();
  }
}

/**
 * Flattens an ACP prompt into plain text. Text blocks are passed through; resource links and embedded resources are
 * inlined as references so the Osaurus agent sees them as context.
 */
export function promptToText(blocks: ContentBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "text":
        parts.push(block.text);
        break;
      case "resource_link":
        parts.push(`[${block.name}](${block.uri})`);
        break;
      case "resource": {
        const resource = block.resource;
        if ("text" in resource && typeof resource.text === "string") {
          parts.push(resource.text);
        }
        break;
      }
      // image/audio blocks are not advertised in promptCapabilities and therefore never sent by a compliant client.
    }
  }
  return parts.join("\n");
}
