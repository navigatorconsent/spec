# Decision log

Resolved and open design decisions for the `navigator.consent` API.

## A. Core protocol semantics

- [D-001 Which writer wins when preferences conflict](decisions/d-001.md) — decided
- [D-002 Who can write preferences and when](decisions/d-002.md) — decided
- [D-003 What requestConsent returns (signal vs finalized decision)](decisions/d-003.md) — decided
- [D-004 Single withdraw method naming](decisions/d-004.md) — decided
- [D-005 How vendor and purpose lists aggregate across registrations](decisions/d-005.md) — open

## B. Scope and storage boundaries

- [D-006 Who defines consent scope (domain, origin, path)](decisions/d-006.md) — decided
- [D-007 How cross-origin iframes register and interact](decisions/d-007.md) — decided
- [D-008 Session vs persistent storage defaults](decisions/d-008.md) — open
- [D-009 Behavior in WebViews, incognito, and private mode](decisions/d-009.md) — open

## C. Transparency and audit model

- [D-010 Required provenance fields and format](decisions/d-010.md) — open
- [D-011 Tamper-evidence for audit logs](decisions/d-011.md) — open
- [D-012 Who can read audit logs, for how long, in what format](decisions/d-012.md) — open
- [D-013 Rate limits and quotas for open registration](decisions/d-013.md) — decided
- [D-014 Minimum DevTools panel features](decisions/d-014.md) — open
- [D-015 Warning event type (dedicated vs audit payload)](decisions/d-015.md) — open

## D. Data model and schemas

- [D-016 Free-form vs namespaced vendor and purpose IDs](decisions/d-016.md) — decided
- [D-017 How to extend legalBasis and capabilities without fragmentation](decisions/d-017.md) — decided
- [D-018 Required fields for vendor and purpose declarations](decisions/d-018.md) — decided
- [D-019 How breaking schema changes are announced](decisions/d-019.md) — decided
- [D-027 Whether vendors declare which purposes they serve](decisions/d-027.md) — decided
- [D-028 Legal basis on purpose vs registration level](decisions/d-028.md) — decided

## E. Assistant UX and safety

- [D-020 Single warning level vs severity taxonomy](decisions/d-020.md) — decided
- [D-021 Whether to define a strict mode that blocks on mismatch](decisions/d-021.md) — decided
- [D-022 Whether hide/show require user trigger](decisions/d-022.md) — decided

## F. Interop and governance

- [D-023 Minimum compliant implementation definition](decisions/d-023.md) — decided
- [D-024 Process for updating the RFC](decisions/d-024.md) — decided
- [D-025 Separation between spec and policy advocacy](decisions/d-025.md) — decided

## G. Cross-platform expansion

- [D-026 Cross-platform entities (permissions, data categories, SDKs)](decisions/d-026.md) — open
- [D-029 Browser-level regulation context signal](decisions/d-029.md) — decided
- [D-030 Single vs plural regulations in RegulationInfo](decisions/d-030.md) — decided
- [D-031 How assistants learn about the first-visit consent prompt](decisions/d-031.md) — decided

