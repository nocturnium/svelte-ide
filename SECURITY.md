# Security Policy

## Supported versions

The library is pre-1.0 and follows a "latest patch" support model: security
fixes land on the most recent `0.x` release. Please upgrade to the latest
version before reporting an issue.

| Version | Supported |
| ------- | --------- |
| 0.2.x   | ✅        |
| < 0.2   | ❌        |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Instead, email **hello@nocturnium.ai** with:

- a description of the issue and its impact,
- steps to reproduce (a minimal proof of concept if possible),
- the affected version(s) and environment.

We aim to acknowledge reports within a few business days and will keep you
updated as we investigate. Once a fix is available we will credit reporters who
wish to be named.

## Scope notes

A few areas are worth calling out for anyone assessing this project:

- **AI message rendering.** Components such as `AIMessageContent` render model
  output. The library escapes HTML and whitelists link schemes before any
  `{@html}` use, but you remain responsible for the trust level of the model
  endpoint you connect.
- **The `backend/` LSP bridge** spawns native language servers against the local
  filesystem. By design it only accepts connections from `localhost` origins
  unless you explicitly pass `-allowed-origins`. **Do not expose it to untrusted
  networks**, and never run it with `-allowed-origins '*'` on a public host.
- **The plugin system** can execute untrusted plugin code. The provided sandbox
  is best-effort; treat plugin sources as you would any third-party code and run
  them behind your own review/approval flow.
