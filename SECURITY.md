# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| Latest (main) | Yes |

## Reporting a Vulnerability

If you discover a security vulnerability, please do **not** open a public GitHub issue.

Instead, report it privately by emailing the maintainer or opening a [GitHub Security Advisory](https://github.com/riigait/ims/security/advisories/new).

Please include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

You will receive a response within 7 days. If the vulnerability is confirmed, a fix will be released as soon as possible.

## Security Notes

- Never commit `.env` files or secrets to the repository
- Always change the default `JWT_SECRET` before deploying
- Use strong, unique database passwords in production
- Run behind a reverse proxy (nginx, Caddy) in production
- Keep Node.js and npm dependencies up to date
