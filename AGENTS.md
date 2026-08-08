# AI Agents Instructions

`osaurus-acp` is an ACP (Agent Client Protocol) wrapper around the Osaurus
`/agents/{id}/run` endpoint. It lets ACP-compatible editors and IDEs drive
the Osaurus agent loop as if it were a native ACP agent.

## Tech stack

- Language: TypeScript
- Runtime: Bun
- Test runner: `bun test`
- Packaging: Nix Flakes, structured with `flake-parts`
- Nix packaging of the JS/TS build: `bun2nix`

## Build & test

- Install dependencies: `bun install`
- Run tests: `bun test`
- Build the Nix package: `nix build`

Run these checks before opening a PR when they apply to your change.

## Nix structure

- The flake follows the `flake-parts` module pattern.
- Development tooling, devShells, and dev-only dependencies live in a
  separate `dev` partition, kept out of the main evaluation/build path.
  Enter it with `nix develop --no-pure-eval`.
- The release package is exposed at `packages.<system>.osaurus-acp`,
  built via `bun2nix`.

## Conventions

- Keep changes scoped; add or update `bun test` coverage where practical.
- Prefer Bun-native APIs over Node.js-specific polyfills unless required
  for compatibility.
- This file is intentionally minimal. It is expected to grow as the
  project matures — add sections (code style, security notes, PR/commit
  conventions) once such conventions are actually established, rather
  than speculatively.

## AI usage

This project follows [AI_POLICY.md](./AI_POLICY.md). In short: AI-assisted
contributions are welcome, but the human contributor must review and
fully understand every change, sign off per the DCO, and disclose
substantial AI assistance via an `Assisted-by` commit trailer.
