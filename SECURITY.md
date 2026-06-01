# Security Policy

We take TaskPilot's security seriously. Thanks for helping keep the project and its users safe.

## Supported Versions

Only the latest minor release of `main` receives security patches. Older versions are not supported.

## Reporting a Vulnerability

**Please do not open a public GitHub issue.**

Email **security@taskpilot.dev** with:

- A description of the issue and its impact
- Steps to reproduce (proof of concept welcome)
- Affected version / commit
- Any suggested remediation

You'll receive an acknowledgement within **72 hours**. We aim to triage within **7 days** and ship a fix or mitigation within **30 days**, depending on severity.

## Disclosure

We follow coordinated disclosure: once a fix is released, we'll credit the reporter (unless you prefer to remain anonymous) and publish a brief advisory on the Releases page.

## Scope

In scope:

- The `taskpilot-backend` API and WebSocket gateway
- The `taskpilot-frontend` web client
- Build/release tooling in this repository

Out of scope:

- Findings against third-party hosts you deploy yourself (Cloudinary, SMTP providers, Postgres hosts) — report to the vendor
- Social engineering, physical security
- Denial-of-service against shared dev infrastructure
