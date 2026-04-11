# Project context

This repository is a draft RFC proposing `navigator.consent`, a browser API for interoperability between Consent Management Platforms (CMPs) and Privacy Assistant browser extensions. It is exploratory, not production code. No backward compatibility or deprecation concerns apply.

Read `notice.md` for the human-LLM collaboration model. The human decides product direction, design choices, and policy positioning. The LLM implements within approved scope.

# Key files

- `rfc.md` — the normative specification. Source of truth for API surface, types, and behavior.
- `discussion.md` — all design decisions and open topics. Check here before proposing changes to settled topics (locked decisions are prefixed `L-`, resolved topics have a `Decision:` line).
- `shim/navigator-consent-shim.js` — working polyfill that implements the API. Must stay aligned with `rfc.md`.
- `shim/navigator-consent-shim.d.ts` — TypeScript types. Must stay aligned with `rfc.md` common types.
- `schemas/` — JSON Schema files (draft 2020-12). Must stay aligned with `rfc.md` type definitions.
- `digital-omnibus-position-paper.md` — EU policy advocacy. Separate from the technically-neutral RFC.

# Artifact alignment

When modifying the API surface (methods, types, enums, fields), these files must stay consistent:
1. `rfc.md` (normative spec)
2. `shim/navigator-consent-shim.js` (implementation)
3. `shim/navigator-consent-shim.d.ts` (TypeScript types)
4. `schemas/*.schema.json` (JSON Schemas)

The companion documentation website lives in a separate repository: https://github.com/navigatorconsent/website (references this repo as a submodule). Integration guides and the RFC rendering pipeline live there.

# Terminology

- **CMP**: Consent Management Platform (runs in DOM context, page scripts)
- **Privacy Assistant**: browser extension (runs in extension context)
- **DOM context**: page scripts that can register but cannot read metadata
- **Extension context**: extension scripts that can read metadata but cannot register
- **Provenance**: runtime-derived attribution (`user` > `cmp`/`privacy_assistant`), not caller-supplied

# Architecture essentials

- The API lives at `navigator.consent`.
- Methods are split by permission boundary: some DOM-only, some extension-only, some shared (see RFC Section 5.3).
- Conflict resolution uses provenance precedence: `user` wins over `cmp` and `privacy_assistant`. Between `cmp` and `privacy_assistant`, last-write-wins.
- Open registration model, no allow-lists or attestation gates.
- CMP owns consent scope, persistence, and compliance. The API is a coordination layer only.

# Conventions

- Use sub-agents to minimize context exhaustion.
- Fetch up-to-date sources on the internet using WebSearch or WebFetch when needed.
- Don't make design decisions without asking the user first (see `notice.md` escalation rule).
- No tests unless instructed. No extra abstractions beyond what's requested.
- `discussion.md` is the canonical place for open design questions. Add new topics there rather than making assumptions.
- Em dashes are lazy writing. Use colons, commas, parenthesis, new sentences instead.
