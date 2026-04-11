# navigator.consent

A draft RFC proposing `navigator.consent` — a browser-level API that standardizes communication between Consent Management Platforms (CMPs) and Privacy Assistant Software (browser extensions).

## Problem

- Users face repetitive, low-value consent banners on every site visit.
- Privacy assistants (browser extensions) reverse-engineer CMP DOM structures, which is fragile and breaks frequently.
- There is no standard way for CMPs and privacy assistants to exchange consent metadata or coordinate preferences.

## Proposed solution

A neutral browser API (`navigator.consent`) that acts as a transport and coordination layer:

- **CMPs** register vendors, purposes, and consent interfaces through structured methods.
- **Privacy assistants** read that metadata and apply user preferences programmatically.
- **The browser** enforces context boundaries, derives provenance, and maintains an audit trail.

CMPs retain full responsibility for compliance, transparency, and consent storage. The API does not centralize consent logic in any single actor.

## Repository structure

```
rfc.md                             Core specification
discussion.md                     Design decisions and open topics
notice.md                         Human + LLM collaboration process
digital-omnibus-position-paper.md EU Digital Omnibus policy position

shim/
  navigator-consent-shim.js       Polyfill implementation
  navigator-consent-shim.d.ts     TypeScript type definitions
  navigator-consent-tcf-adapter.js TCF v2.2 adapter
  demo.html                       Interactive demo (open in browser)
  demo-tcf.html                   TCF adapter demo

schemas/
  cmp.schema.json                 CMP registration payload
  vendor.schema.json              Vendor declaration
  purpose.schema.json             Purpose declaration
  preferences.schema.json         Preference updates
  event.schema.json               Consent events
  consent-record.schema.json      Audit records
  regulation-info.schema.json     Regulation info
```

## Getting started

**Read the spec**: Start with `rfc.md` for the full API specification.

**Try the demo**: Open `shim/demo.html` in a browser. It loads the polyfill and lets you walk through CMP registration, vendor/purpose declaration, and preference updates interactively.

**Review design decisions**: `discussion.md` tracks all resolved and open design topics with rationale.

## Documentation site

The companion documentation website lives in a separate repository: [navigatorconsent/website](https://github.com/navigatorconsent/website).

## Key concepts

| Term | Meaning |
|------|---------|
| CMP | Consent Management Platform — presents consent UI, stores evidence, signals downstream |
| Privacy Assistant | Browser extension that reads consent metadata and applies user preferences |
| DOM context | Page scripts and CMP scripts — can register interfaces but cannot read metadata |
| Extension context | Browser extension scripts — can read metadata and apply preferences but cannot register |
| Provenance | Runtime-derived attribution (`user`, `cmp`, `privacy_assistant`) used for conflict resolution |

## How to contribute

This is an exploratory draft. Feedback is welcome on the API surface, security model, and interoperability considerations. See `discussion.md` for the current list of open and resolved design topics.
