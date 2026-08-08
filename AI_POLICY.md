# AI Policy

This policy applies to any contribution to this project — code, tests,
documentation, commit messages, and issue/PR comments — that was fully or
partially produced with the help of AI tools (LLMs, coding assistants,
autonomous agents).

## 1. Review and understanding are mandatory

AI-generated contributions are only accepted if the contributor can
demonstrate, within the pull request itself (description, inline
comments, and answers to reviewer questions), that they have reviewed
and fully understood the generated code.

- You must be able to explain any part of your change in your own words
  if a maintainer asks.
- Pull requests that look like unreviewed, unexplained AI output — or
  where the contributor cannot answer basic questions about the change —
  will be rejected without further review.

## 2. No AI spamming

- Do not open issues or pull requests that were created autonomously by
  an agent without human oversight.
- Do not flood the project with low-effort, AI-drafted issues, duplicate
  PRs, or auto-generated comments.
- Maintainers may close or flag such contributions as spam without
  extended discussion, and repeated spamming may result in the
  contributor being blocked from the project.

## 3. Sign-off and Developer Certificate of Origin

Every commit must carry a `Signed-off-by` trailer, per the [Developer
Certificate of Origin](https://developercertificate.org/) (DCO).

By signing off, the contributor confirms that they:

1. have reviewed all code in the contribution, including any
   AI-generated parts;
2. have verified the contribution complies with applicable license
   terms and does not introduce unlicensed or incompatible third-party
   code; and
3. take full personal responsibility for the contribution, regardless
   of what tooling was used to help produce it.

AI tools/agents must **never** add a `Signed-off-by` trailer on their
own — only a human contributor can certify the DCO.

## 4. Disclosure via `Assisted-by`

If AI assistance materially contributed to a change (generated logic,
non-trivial code, or substantial text), add an `Assisted-by` trailer to
the commit message, e.g.:

```
Assisted-by: Claude:claude-sonnet-5
```

- The specific tool or model name is a best-effort identifier; exact
  version tracking is not required.
- Minor uses (autocomplete, small wording tweaks) do not need a trailer;
  generated logic, non-trivial code blocks, or drafted documentation do.

## Enforcement

Maintainers judge compliance on a case-by-case basis. Contributions that
violate this policy — unreviewed AI dumps, spam, or missing sign-off —
will be closed. Repeated violations may lead to the contributor being
blocked from the project.
