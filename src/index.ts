#!/usr/bin/env bun
/**
 * SPDX-FileCopyrightText: 2026 Robin Walter <hello@robinwalter.me>
 * SPDX-License-Identifier: Apache-2.0
 *
 * Entry point for the Osaurus ACP adapter.
 *
 * Speaks newline-delimited JSON-RPC (ACP) over stdio. Zed spawns this
 * process as an external agent; all logging therefore goes to stderr to
 * keep stdout protocol-clean.
 *
 * Configuration via environment:
 *   OSAURUS_BASE_URL  Base URL of the Osaurus server (default: "http://localhost:1337")
 *   OSAURUS_AGENT_ID  Agent UUID or alias to run     (default: "default")
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
import { AgentSideConnection, ndJsonStream } from "@zed-industries/agent-client-protocol";

import { OsaurusAcpAgent } from "./agent.js";
import { OsaurusClient } from "./osaurus-client.js";

const baseUrl = process.env.OSAURUS_BASE_URL ?? "http://localhost:1337";
const agentId = process.env.OSAURUS_AGENT_ID ?? "default";

const client = new OsaurusClient({ baseUrl });

// Bridge Node's stdio streams to the Web streams the SDK expects.
const output = new WritableStream<Uint8Array>({
  write(chunk) {
    return new Promise((resolve, reject) => process.stdout.write(chunk, (err) => (err ? reject(err) : resolve())));
  },
});
const input = new ReadableStream<Uint8Array>({
  start(controller) {
    process.stdin.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
    process.stdin.on("end", () => controller.close());
    process.stdin.on("error", (err) => controller.error(err));
  },
});

const stream = ndJsonStream(output, input);

new AgentSideConnection((connection) => new OsaurusAcpAgent({ client, agentId }, connection), stream);

console.error(`osaurus-acp: ready (server=${baseUrl}, agent=${agentId})`);
