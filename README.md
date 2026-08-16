# Osaurus ACP

[![Conventional Branch](https://img.shields.io/badge/Conventional%20Branch-1.0.0-blue.svg?style=flat-square)](https://conventional-branch.github.io/)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg?style=flat-square)](https://conventionalcommits.org)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-3.0-4BAAAA.svg?style=flat-square)](./.github/CODE_OF_CONDUCT.md)
[![prek](https://img.shields.io/endpoint?style=flat-square&url=https://raw.githubusercontent.com/j178/prek/master/docs/assets/badge-v0.json)](https://github.com/j178/prek)
[![Built with Nix](https://img.shields.io/badge/NixOS-5277C3?style=flat-square&logo=nixos&logoColor=white)](https://github.com/NixOS/nixpkgs)
[![Zed](https://img.shields.io/badge/Zed-white?style=flat-square&logo=zedindustries&logoColor=084CCF)](https://zed.dev/)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/robinwalterfit/osaurus-acp)

---

> [!CAUTION]
> This project is currently a PoC (Proof-of-Concept) and therefore not feature-complete. Use at your risk.

---

ACP (Agent Client Protocol) adapter that exposes [Osaurus](https://osaurus.ai/)
agents to ACP clients like [Zed](https://zed.dev). It speaks newline-delimited JSON-RPC over
stdio and forwards prompt turns to Osaurus' `POST /agents/{id}/run` endpoint, streaming the
SSE text deltas back as `agent_message_chunk` session updates.

## Requirements

- [Bun](https://bun.sh) ≥ 1.1
- A running Osaurus server (default port `1337`)

## Setup

```sh
bun install
```

## Configuration

| Environment variable | Default                 | Description                        |
| -------------------- | ----------------------- | ---------------------------------- |
| `OSAURUS_BASE_URL`   | `http://localhost:1337` | Base URL of the Osaurus server     |
| `OSAURUS_AGENT_ID`   | `default`               | Agent UUID, or the alias `default` |

## Run

```sh
bun start
```

## Use with Zed

Add an agent server to your Zed `settings.json`:

```json
{
    "agent_servers": {
        "Osaurus": {
            "args": ["run", "/absolute/path/to/osaurus-acp/src/index.ts"],
            "command": "bun",
            "env": {
                "OSAURUS_AGENT_ID": "default",
                "OSAURUS_BASE_URL": "http://localhost:1337"
            }
        }
    }
}
```

Then select "Osaurus" as the agent in the Agent Panel.

## Development

```sh
bun test            # unit tests
bun run typecheck   # tsc --noEmit
bun run test/e2e-smoke.mjs   # end-to-end smoke test against a mock Osaurus server
```

A development shell with useful tooling is provided:

```bash
nix develop --no-pure-eval
```

The above command will replace the current shell. `direnv` and `nix-direnv` provide an alternative way to load the Nix development shell into the current shell instead. Create a new file `.envrc` in the root of the repository and paste the following content into the file:

```sh
#!/usr/bin/env bash

if ! has nix_direnv_version || ! nix_direnv_version 3.1.0; then
  source_url "https://raw.githubusercontent.com/nix-community/nix-direnv/3.1.0/direnvrc" "sha256-yMJ2OVMzrFaDPn7q8nCBZFRYpL/f0RcHzhmw/i6btJM="
fi

export DEVENV_IN_DIRENV_SHELL=true

watch_file flake.nix
watch_file flake.lock
watch_file nix/dev/flake.lock
# shellcheck disable=SC2046
watch_file $(find './nix' -name '*.nix')

use flake . --no-pure-eval
```

Now run `direnv allow` in the project root, where `.envrc` is located. The development shell will now be loaded into the current shell whenever any directory of this project will be entered and automatically unloaded, when the project space will be left.

**NOTE**: The first time the development shell will be loaded can take a few minutes.

## How it works

- `initialize` negotiates protocol version 1 and declares no auth methods (Osaurus is local, no auth).
- `session/new` creates an ACP session whose ID is reused as the Osaurus `session_id`, so
  conversation history is persisted server-side and only the new user message is sent per turn.
- `session/prompt` flattens the prompt content blocks to plain text (resource links are inlined
  as markdown references), calls `POST /agents/{id}/run` with `stream: true`, and forwards each
  `choices[0].delta.content` SSE chunk as an `agent_message_chunk` notification.
- `session/cancel` aborts the in-flight HTTP request; the prompt resolves with `stopReason: "cancelled"`.

## Contributing

Read the [contributing guide](./CONTRIBUTING.md) to learn about the development process and how to submit changes.

## Links

- `osaurus-acp` repository: [https://github.com/robinwalterfit/osaurus-acp](https://github.com/robinwalterfit/osaurus-acp)
- Issue tracker: [https://github.com/robinwalterfit/osaurus-acp/issues](https://github.com/robinwalterfit/osaurus-acp/issues)
- More Links:
    - ACP (Agent Client Protocol): [https://agentclientprotocol.com/get-started/introduction](https://agentclientprotocol.com/get-started/introduction)
    - `AGENTS.md`: [https://agents.md/](https://agents.md/)
    - ASCII Tree Generator: [https://ascii-tree-generator.com/](https://ascii-tree-generator.com/)
    - Biome: [https://biomejs.dev/](https://biomejs.dev/)
    - Bun: [https://bun.sh/](https://bun.sh/)
    - Cocogitto: [https://docs.cocogitto.io/](https://docs.cocogitto.io/)
    - Collection of useful `.gitattributes` templates: [https://github.com/gitattributes/gitattributes](https://github.com/gitattributes/gitattributes)
    - Conventional Branch: [https://conventional-branch.github.io/](https://conventional-branch.github.io/)
    - Conventional Commits: [https://www.conventionalcommits.org/en/v1.0.0/](https://www.conventionalcommits.org/en/v1.0.0/)
    - contributing-template: [https://github.com/nayafia/contributing-template](https://github.com/nayafia/contributing-template)
    - Contributor Covenant Code of Conduct: [https://www.contributor-covenant.org/version/3/0/code_of_conduct/](https://www.contributor-covenant.org/version/3/0/code_of_conduct/)
    - Developer Certificate of Origin: [https://developercertificate.org/](https://developercertificate.org/)
    - `devenv`: [https://devenv.sh/guides/using-with-flake-parts/](https://devenv.sh/guides/using-with-flake-parts/)
    - `direnv`: [https://direnv.net/](https://direnv.net/)
    - Flakes: [https://nix.dev/concepts/flakes.html](https://nix.dev/concepts/flakes.html)
    - `flake-parts`: [https://flake.parts/](https://flake.parts/)
    - `.gitignore` Generator: [https://gitignore.io](https://gitignore.io)
    - Git Flow: [https://nvie.com/posts/a-successful-git-branching-model/](https://nvie.com/posts/a-successful-git-branching-model/)
    - `git-hooks.nix`: [https://github.com/cachix/git-hooks.nix](https://github.com/cachix/git-hooks.nix)
    - keep a changelog: [https://keepachangelog.com/en/1.1.0/](https://keepachangelog.com/en/1.1.0/)
    - Lix: [https://lix.systems/](https://lix.systems/)
    - Nix Package Search: [https://search.nixos.org/packages](https://search.nixos.org/packages)
    - NixHub: [https://www.nixhub.io/](https://www.nixhub.io/)
    - `nix-direnv`: [https://github.com/nix-community/nix-direnv](https://github.com/nix-community/nix-direnv)
    - `nix-index`: [https://github.com/nix-community/nix-index](https://github.com/nix-community/nix-index)
    - `nix-modules`: [https://github.com/robinwalterfit/nix-modules](https://github.com/robinwalterfit/nix-modules)
    - `nix-versions`: [https://nix-versions.oeiuwq.com/](https://nix-versions.oeiuwq.com/)
    - Osaurus: [https://osaurus.ai/](https://osaurus.ai/)
    - prek: [https://prek.j178.dev/](https://prek.j178.dev/)
    - Renovate: [https://docs.renovatebot.com/](https://docs.renovatebot.com/)
    - REUSE: [https://reuse.software/](https://reuse.software/)
    - Semantic Versioning: [https://semver.org/](https://semver.org/)
    - SPDX-Spec: [https://spdx.github.io/spdx-spec/v3.0.1/](https://spdx.github.io/spdx-spec/v3.0.1/)
    - Taplo: [https://taplo.tamasfe.dev/](https://taplo.tamasfe.dev/)
    - `treefmt-nix`: [https://github.com/numtide/treefmt-nix](https://github.com/numtide/treefmt-nix)
    - Zed: [https://zed.dev/](https://zed.dev/)

## License

`osaurus-acp` is [Apache-2.0 licensed](./LICENSE) and moderated under the [Contributor Covenant Code of Conduct](./.github/CODE_OF_CONDUCT.md).
