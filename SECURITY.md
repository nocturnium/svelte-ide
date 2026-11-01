# Security Policy

## Supported versions

The library follows a "latest release" support model for the current 2.x line.
Security fixes land on the most recent `2.x` release. Please upgrade to the
latest version before reporting an issue.

| Version | Supported |
| ------- | --------- |
| 2.x     | ✅        |
| < 2.0   | ❌        |

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
  filesystem. By default it listens on `127.0.0.1` only and accepts browser
  connections from `localhost` origins unless you pass `-allowed-origins`. It
  has no authentication, and clients that send no `Origin` header are accepted,
  so binding it to a non-loopback address exposes it to that network. **Do not expose it to untrusted
  networks**, and never run it with `-allowed-origins '*'` on a public host.
- **The plugin system** ships no client-side sandbox. Plugin code you load runs
  with your app's privileges, and `PluginPreviewSandbox`, despite its name, runs
  preview transforms in the host page. Run untrusted plugin code on your plugin
  host or in a cross-origin iframe or Worker (see `docs/guides/plugins.md`,
  "Running untrusted plugin code").
