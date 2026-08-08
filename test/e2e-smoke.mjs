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
// E2E smoke test: spawn src/index.ts as a subprocess, speak ACP JSON-RPC
// over stdio, and serve a mock Osaurus SSE endpoint.
import { spawn } from "node:child_process";
import http from "node:http";

const sseBody = [
  `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}\n\n`,
  `data: ${JSON.stringify({ choices: [{ delta: { content: " from Osaurus" } }] })}\n\n`,
  "data: [DONE]\n\n",
].join("");

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/agents/default/run") {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(sseBody);
  } else {
    res.writeHead(404).end("not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;

const child = spawn("bun", ["run", "src/index.ts"], {
  cwd: import.meta.dir + "/..",
  env: { ...process.env, OSAURUS_BASE_URL: `http://127.0.0.1:${port}` },
  stdio: ["pipe", "pipe", "inherit"],
});

let buffer = "";
const pending = new Map();
const notifications = [];
child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      pending.get(msg.id)?.(msg);
      pending.delete(msg.id);
    } else {
      notifications.push(msg);
    }
  }
});

let nextId = 1;
function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, (msg) => (msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)));
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

const init = await request("initialize", { protocolVersion: 1, clientCapabilities: {} });
console.log("initialize ->", JSON.stringify(init));

const session = await request("session/new", { cwd: "/tmp", mcpServers: [] });
console.log("session/new ->", JSON.stringify(session));

const prompt = await request("session/prompt", {
  sessionId: session.sessionId,
  prompt: [{ type: "text", text: "Say hi" }],
});
console.log("session/prompt ->", JSON.stringify(prompt));

const chunks = notifications.filter((n) => n.method === "session/update").map((n) => n.params.update?.content?.text);
console.log("streamed chunks ->", JSON.stringify(chunks));

const ok =
  init.protocolVersion === 1 &&
  typeof session.sessionId === "string" &&
  prompt.stopReason === "end_turn" &&
  chunks.join("") === "Hello from Osaurus";

child.kill();
server.close();
console.log(ok ? "E2E SMOKE TEST PASSED" : "E2E SMOKE TEST FAILED");
process.exit(ok ? 0 : 1);
