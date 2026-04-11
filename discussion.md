# Discussion Topics (Refinement Backlog)

This file tracks debatable topics and refinement points so we can iterate without context exhaustion.

## How to use this file

- Discuss one topic ID at a time.
- When a decision is made, move it to a short "decided" note in that topic.
- Keep unresolved items concise and explicit.

## Locked decisions (already agreed)

- **L-001 Open trust model**: no DRM-like attestation/allow-list gatekeeping for registrations.
- **L-002 API naming**: use `registerInterface()` (no legacy alias, no deprecation path).
- **L-003 DevTools scope**: DevTools panel should show declared data only (do not duplicate Network/Application observed signals).
- **L-004 Mismatch default behavior**: assistants should `warn` by default, not hard-block.

## Open topics to debate / refine

## A. Core protocol semantics

### D-001 Conflict precedence model
- **Question**: Replace `last-write-wins` with explicit precedence?
- **Why it matters**: silent overrides can conflict with user intent.
- **Decision**: Use provenance-aware explicit precedence.
- **Decided behavior**:
  - `user`-provenance updates win over `cmp` and `privacy_assistant`.
  - Once a key is set by `user`, later non-user updates do not override it.
  - Between `cmp` and `privacy_assistant` (when no `user` value exists), keep deterministic last-write-wins.
- **Rationale**: protects explicit user intent while preserving deterministic behavior for automation conflicts.
- **Follow-up changes**: RFC Section 7.3 updated to normative precedence rules.

### D-002 Dual-writer behavior for `updatePreferences()`
- **Question**: Should both CMP and assistant always be allowed to write at any time?
- **Why it matters**: race conditions and surprise changes.
- **Decision**: Keep both writers allowed, with provenance-aware conflict handling.
- **Decided behavior**:
  - Browser evaluates writes using runtime provenance (`user`, `cmp`, `privacy_assistant`) rather than caller identity.
  - Caller-supplied `source` is non-authoritative; runtime provenance drives precedence.
  - Assistant writes cannot override keys already set by `user`.
  - Manual user action through assistant UI is treated as `user` provenance.
- **Rationale**: assumes good-faith actors while preserving user authority and keeping interop practical.
- **Persistence note**: duration/retention of choices is CMP-managed and out of scope for this RFC.

### D-003 `requestConsent()` contract depth
- **Question**: Is `requestConsent()` just a signal, or must it return a finalized decision?
- **Why it matters**: implementation complexity and UX predictability.
- **Decision**: `requestConsent()` is a contextual trigger that returns latest-available snapshot (not guaranteed finalized).
- **Decided behavior**:
  - CMP uses `requestConsent()` for contextual consent needs (specific vendor/purpose required to proceed).
  - Browser notifies active assistant(s); assistant may auto-apply preferences or ask user in assistant UI.
  - Call resolves promptly with latest available snapshot, even if assistant cannot handle the request.
  - If requested scope remains denied/unset, CMP can reopen and ask the user directly.
- **Rationale**: keeps API simple while enabling assistant-first contextual handling and preserving CMP fallback UX.
- **Follow-up changes**: RFC Section 6.4.4 updated with normative contextual flow semantics.

### D-004 Withdrawal primitive naming
- **Question**: Keep separate withdrawal method names by context, or use one method?
- **Why it matters**: API clarity and duplicate behavior.
- **Decision**: Use a single shared method `withdraw()` and remove `withdrawConsent()` / `revoke()`.
- **Decided behavior**:
  - Both CMP and assistant call `navigator.consent.withdraw()`.
  - Browser derives provenance and records source accordingly.
  - Event type and audit record type for this action are `withdraw`.
  - No compatibility aliases are kept in this exploration codebase.
- **Rationale**: `withdraw()` is concise in the `navigator.consent` namespace and avoids duplicate API surface.
- **Follow-up changes**: RFC, shim, site docs, and schemas renamed to `withdraw`.

### D-005 Aggregation behavior for `getVendors()` / `getPurposes()`
- **Question**: How should aggregation across multiple registrations be ordered and represented?
- **Why it matters**: determinism and assistant logic consistency.
- **Candidate options**:
  - A) dedupe by ID, return source map
  - B) no dedupe, return per-registration lists
  - C) dedupe + confidence or provenance ranking

## B. Scope and storage boundaries

### D-006 Consent scope definition
- **Question**: Domain, eTLD+1, origin, or path-scoped?
- **Why it matters**: portability of consent decisions and legal interpretation.
- **Decision**: Consent scope and persistence policy are CMP responsibility.
- **Decided behavior**:
  - CMP defines and applies its own scope model (for example origin, domain, eTLD+1, path, or policy-defined variants).
  - Browser API does not impose a canonical storage scope model.
  - CMP SHOULD synchronize already-collected effective preferences after registration via `updatePreferences()`.
  - Browser stores and coordinates effective preferences/events for interoperability and audit, without redefining CMP storage policy.
- **Rationale**: keeps `navigator.consent` as a neutral coordination layer and avoids replacing CMP consent storage semantics.
- **Follow-up changes**: RFC clarifies CMP-owned scope/persistence and explicit bootstrap synchronization flow.

### D-007 Frame and embedded context behavior
- **Question**: How should cross-origin iframes register and interact?
- **Why it matters**: modern pages are multi-origin by default.
- **Decision**: Allow frame-autonomous registration with strict provenance and registration ownership rules.
- **Decided behavior**:
  - Cross-origin iframes MAY register independently.
  - Browser MUST attach runtime provenance (`topLevelOrigin`, `frameOrigin`, `scriptOrigin`) to audit/events.
  - DOM-context mutating calls without `registrationId` resolve to caller registration.
  - DOM-context callers MUST NOT mutate registrations they do not own.
  - Embedded `requestConsent()` flows SHOULD be user-triggered for contextual unblock actions.
  - Abuse controls for high-volume registrations/payloads are handled under D-013.
- **Rationale**: preserves embedded autonomy and keeps `navigator.consent` neutral while maintaining strong runtime attribution and ownership boundaries.
- **Follow-up changes**: RFC adds normative frame behavior and registration ownership language.

### D-008 Persistence lifecycle
- **Question**: Session-only vs persistent storage defaults?
- **Why it matters**: user expectations and repeated prompts.
- **Current direction**: persistence policy is CMP-managed (see D-006); browser-level default persistence policy is out of scope for this RFC.

### D-009 WebView and private mode constraints
- **Question**: Define minimum behavior for webviews/incognito/private contexts?
- **Why it matters**: large share of traffic and known storage limitations.

## C. Transparency and audit model

### D-010 Provenance schema contract
- **Question**: Finalize required provenance fields and exact format?
- **Why it matters**: cross-browser comparability.
- **Current state**: shim includes `topLevelOrigin`, `frameOrigin`, `scriptOrigin`.

### D-011 Append-only audit guarantees
- **Question**: Do we require tamper-evident chaining/signatures?
- **Why it matters**: trust from transparency depends on integrity.

### D-012 Audit access, retention, export
- **Question**: Who can read logs, for how long, and in what format?
- **Why it matters**: privacy, compliance, and portability.

### D-013 Anti-spam controls for open registration
- **Question**: What limits apply to repeated registrations and oversized payloads?
- **Why it matters**: open model can be abused without operational limits.
- **Decision**: Adopt the balanced anti-spam profile.
- **Decided behavior**:
  - Enforce registration quotas (per top-level context and per frame context).
  - Enforce payload caps for registration and mutation payloads (count/size limits).
  - Enforce mutation rate limits for high-frequency write calls.
  - Enforce bounded operational audit retention to avoid unbounded runtime growth.
  - On blocked calls, return machine-readable errors and emit auditable abuse warnings with reason codes and provenance.
- **Rationale**: preserves open registration while preventing resource exhaustion and consent-signal noise from malicious or buggy callers.
- **Trade-offs accepted**:
  - Some high-volume legitimate integrations may need batching/adaptation.
  - Audit history exposed via runtime API can be partial due to bounded retention.
- **Follow-up changes**: RFC adds normative anti-spam controls and rejection observability rules.

### D-014 DevTools panel minimum feature set
- **Question**: What is mandatory in the first panel version?
- **Candidate baseline**:
  - registration timeline
  - declaration diffs
  - provenance columns
  - filter by registration/source

### D-015 Warning contract
- **Question**: Should warnings use dedicated event type or stay within `audit` payload?
- **Why it matters**: tooling interoperability and clarity.

## D. Data model and schemas

### D-016 Identifier rules for vendors/purposes
- **Question**: Free-form IDs vs namespaced IDs?
- **Why it matters**: collisions across CMP declarations.
- **Decision**: Keep free-form identifiers and add optional cross-system identifier mapping.
- **Decided behavior**:
  - `Vendor.id` and `Purpose.id` are free-form non-empty strings defined by CMP vendor/admin policy.
  - IDs are interpreted within registration context; cross-registration provenance remains explicit via `registrationId`.
  - `Vendor.additionalIDs` and `Purpose.additionalIDs` MAY be provided as `Record<string, string>` for third-party mappings.
  - Mapping examples include IAB vendor/purpose lists, Google ad/consent identifiers, and Shopify app identifiers.
- **Rationale**: preserves flexibility for heterogeneous CMP ecosystems while enabling deterministic bridge mapping to external taxonomies.
- **Follow-up changes**: RFC common types and schema artifacts updated to include `additionalIDs`.

### D-017 Extensibility of enums
- **Question**: How to add new capabilities/legalBasis values without fragmentation?
- **Why it matters**: forward compatibility.
- **Decision**: Keep `legalBasis` closed and optional; remove `capabilities` from v1 registration payload.
- **Decided behavior**:
  - `legalBasis` remains a closed vocabulary (`consent`, `legitimate_interest`) when declared.
  - `legalBasis` is optional to avoid forcing GDPR/ePrivacy-style semantics in rights-driven regimes (for example CPRA opt-out models).
  - `capabilities` is removed from the v1 declaration model because it is currently non-operational metadata and adds complexity without interop value.
- **Rationale**: preserves legal clarity while avoiding EU-specific lock-in and keeping the core declaration contract lean.
- **Trade-offs accepted**:
  - Future capability taxonomy, if needed, will require a dedicated reintroduction decision with concrete runtime semantics.
- **Follow-up changes**: RFC type definitions and `registerInterface()` contract, CMP schema, and shim validation/storage aligned with this decision.

### D-018 Minimum declaration payload
- **Question**: Are current required fields enough to support informed assistant behavior?
- **Why it matters**: weak declarations reduce practical trust.
- **Decision**: Require readable labels and core transparency fields at declaration time.
- **Decided behavior**:
  - Vendor declarations MUST include `id`, readable label (`name`), `domain`, and `privacyPolicyUrl`.
  - Purpose declarations MUST include `id` and readable label (`name`).
  - `description` remains optional for both entities.
  - `additionalIDs` remains optional for both entities and is used for external taxonomy mapping.
- **Rationale**: assistants and auditors need a minimum human-readable and policy-linkable payload to make declarations actionable.
- **Follow-up changes**: RFC method/type sections and vendor/purpose schemas aligned with this minimum payload.

### D-019 Schema versioning strategy
- **Question**: How are breaking schema changes announced and negotiated?
- **Why it matters**: ecosystem stability.
- **Decision**: Use a lean draft-stage policy aligned with common W3C/WHATWG working practice; defer heavy version negotiation.
- **Decided behavior**:
  - During RFC draft stage, schema evolution SHOULD be additive and backward-compatible by default.
  - This RFC does not introduce a dedicated runtime schema negotiation field at this stage.
  - If a breaking schema change is required, editors MUST explicitly announce it in changelog/release notes and publish a new schema line/path at that time.
  - Formal compatibility governance (for example multi-line support policy) is deferred to CR/interoperability phase.
- **Rationale**: keeps early standardization lightweight while preserving a clear escalation path when interop pressure requires stricter version controls.
- **Follow-up changes**: RFC Section 11 adds a concise draft-stage schema evolution policy note.

### D-027 Vendor-purpose relationships
- **Question**: Should vendors declare which purposes they process data under?
- **Why it matters**: vendors and purposes are independent flat lists with no relationship, but in practice a vendor operates under specific purposes. Without this link, assistants cannot determine which vendors are associated with which purposes.
- **Decision**: Add optional `purposeIds` to `Vendor`.
- **Decided behavior**:
  - `Vendor.purposeIds` MAY be provided as `string[]` referencing registered purpose IDs.
  - The field is metadata for assistants and audit; the browser does not enforce referential integrity against registered purposes.
  - Registration order (purposes before or after vendors) is not constrained.
- **Rationale**: reflects real-world CMP practice where vendors are declared for specific purposes, without coupling the two registration calls or adding validation complexity.
- **Follow-up changes**: RFC common types, vendor schema, shim, TypeScript types, and site code examples updated.

### D-028 Per-purpose legal basis
- **Question**: Should `legalBasis` live on `InterfaceRegistration` (global) or on `Purpose` (per-purpose)?
- **Why it matters**: a CMP may declare some purposes under consent and others under legitimate interest. A single global `legalBasis` on the CMP registration cannot express this.
- **Decision**: Move `legalBasis` from `InterfaceRegistration` to `Purpose`.
- **Decided behavior**:
  - `Purpose.legalBasis` MAY be provided as a single `LegalBasis` value (`"consent"` or `"legitimate_interest"`).
  - `InterfaceRegistration` no longer carries `legalBasis`.
  - The closed vocabulary (`consent`, `legitimate_interest`) is unchanged.
- **Rationale**: legal basis is inherently per-purpose, not per-CMP. Moving it to `Purpose` aligns the data model with how consent frameworks and regulations structure processing activities.
- **Follow-up changes**: RFC common types, CMP schema, purpose schema, shim, TypeScript types, and site code examples updated.

## E. Assistant UX and safety

### D-020 Warning severity taxonomy
- **Question**: Single `warn` level or levels (info/warn/high-risk)?
- **Why it matters**: avoid alert fatigue.
- **Decision**: Keep a single warning level for v1 (`warn` only); do not add a severity taxonomy at RFC stage.
- **Decided behavior**:
  - Warning records/events remain single-level warnings in v1.
  - Implementations SHOULD classify and filter warnings using `kind` and `reasonCode` fields, not severity levels.
  - No dedicated severity field (`info`/`warn`/`high-risk`) is introduced in this draft.
- **Rationale**: minimizes complexity, aligns with warn-not-block behavior, and keeps room to revisit severity in future revisions if concrete need emerges.
- **Follow-up changes**: RFC mismatch/safety section clarifies that v1 warnings do not define multi-level severity.

### D-021 Strict mode policy
- **Question**: Optional user-enabled strict mode that can block on mismatch?
- **Why it matters**: balance safety and usability.
- **Decision**: Do not define strict mode in v1; keep strict-mode policy out of scope for this draft.
- **Decided behavior**:
  - This draft defines warn-and-continue behavior for mismatch handling.
  - Browser/API-level strict-mode semantics are not specified in v1.
  - Assistants are not expected to implement a standardized strict-mode contract in this draft.
- **Rationale**: strict mode is an edge case for this stage and adds complexity/distraction for readers without clear draft-stage interop value.
- **Follow-up changes**: RFC mismatch/safety language simplified to avoid strict-mode framing in the v1 draft.

### D-022 `hide()` / `show()` safeguards
- **Question**: Should these methods require explicit user trigger in some contexts?
- **Why it matters**: avoid suppressing legally required notices unintentionally.
- **Decision**: Do not require explicit user trigger for `hide()` in v1; proactive assistant-driven suppression is allowed.
- **Decided behavior**:
  - Privacy Assistants MAY call `hide()` proactively (including automated flows) to suppress repetitive consent notices.
  - `hide()` / `show()` calls remain auditable and provenance-attributed in the event/audit model.
  - `show()` remains the recovery path to re-open consent UI when needed.
  - CMP compliance responsibility is unchanged; this API coordinates UI signaling and does not transfer legal accountability.
- **Rationale**: the proposal's core objective is to reduce banner fatigue through an auditable assisted-consent mechanism; requiring user-triggered `hide()` would undermine that objective.
- **Follow-up changes**: RFC `hide()`/`show()` method semantics clarified to allow proactive hide without user-activation gating while keeping auditability and reversibility explicit.

## F. Interop and governance

### D-023 Conformance profile
- **Question**: Define "minimum compliant implementation" now or later?
- **Why it matters**: prevents incompatible "almost implementations."
- **Decision**: Define a balanced minimum conformance profile in this draft.
- **Decided behavior**:
  - Draft-stage conformance requires the RFC's existing core MUST requirements (permission boundary, provenance derivation, conflict handling, anti-spam controls, core event semantics, and required declaration fields).
  - SHOULD-level guidance remains non-blocking for conformance at this stage.
  - Optional/deferrable areas (for example DevTools UX and other SHOULD items) are not part of the minimum conformance gate in v1 draft.
- **Rationale**: establishes an anti-fragmentation baseline without over-constraining draft-stage implementations.
- **Follow-up changes**: RFC adds a concise "minimum conformance profile (draft stage)" statement aligned with existing MUST requirements only.

### D-024 Spec governance process
- **Question**: What process updates this RFC (owner, review window, acceptance rule)?
- **Why it matters**: avoids drift and unilateral changes.
- **Decision**: Adopt light governance for draft stage.
- **Decided behavior**:
  - Owner: human repo owner has final decision authority for RFC and related artifacts.
  - Review window: none fixed at draft stage; changes may be applied directly through the established collaboration loop.
  - Acceptance rule: owner approval is sufficient; LLM implements only within approved scope.
  - Objection path: unresolved objections are recorded in `discussion.md`; owner decides final outcome.
- **Rationale**: keeps exploration iteration fast, matches current collaboration rules, and avoids over-formal governance before CR/interoperability phase.
- **Follow-up changes**: RFC Section 1 adds a short draft-stage governance note aligned with this decision.

### D-025 Mapping to policy language
- **Question**: Keep a normative spec only, with separate policy profile doc?
- **Why it matters**: maintain technical neutrality while preserving advocacy clarity.
- **Decision**: Light separation - keep informative policy context in RFC, and keep advocacy/policy mapping in separate project docs.
- **Decided behavior**:
  - RFC retains a short informative regulatory-context section and remains technically neutral.
  - RFC MUST NOT include normative advocacy or policy-position requirements.
  - Advocacy and detailed policy mapping remain in `digital-omnibus-position-paper.md` and `site/policy.html`.
  - Optional policy-facing fields (`legalBasis`, `regulation`, `jurisdiction`) stay in the API, while detailed policy interpretation is documented outside normative RFC requirements.
- **Rationale**: preserves standards-friendly technical neutrality while keeping policy communication explicit and discoverable.
- **Follow-up changes**: RFC Section 4 clarifies informative-only policy context and points readers to separate policy docs.

## G. Cross-platform expansion

### D-026 Additional declaration entities beyond vendors and purposes
- **Question**: Should the declaration model add cross-platform entities (mobile/TV), such as `permissions`, `dataCategories`, or SDK/component declarations, beyond `vendors` and `purposes`?
- **Why it matters**: browser-oriented entities may be insufficient for app and TV consent orchestration where OS-level permissions and SDK-level processing are first-class concerns.
- **Candidate options**:
  - A) keep v1 limited to `vendors` and `purposes`
  - B) add `permissions` only (for example `geolocation`, `notifications`) linked to purposes
  - C) add `permissions` and `dataCategories`
  - D) add `permissions`, `dataCategories`, and SDK/component declarations
- **Timing note**: intentionally deferred; revisit after current core decisions are closed.

### D-029 Regulation context signal (`getRegulations()` / `setRegulations()`)
- **Question**: Should the API provide a browser-level regulation context signal so CMPs and assistants know which regulation applies?
- **Why it matters**: CMPs currently rely on IP geolocation or show the most restrictive UI everywhere. A standard regulation signal enables better UX and allows assistants to correct misdetections (e.g., VPN users).
- **Decision**: Add shared `getRegulations()` and extension-only `setRegulations()` methods.
- **Decided behavior**:
  - `getRegulations()` is shared (DOM + extension context), returns `Promise<RegulationInfo>`.
  - `setRegulations()` is extension-only, allows privacy assistants to override browser-detected regulation.
  - `RegulationInfo` includes `regulations: string[]`, `jurisdiction`, `source` (`"browser"`, `"privacy_assistant"`, or `"user"`), and `browserDefault` (preserved original detection).
  - Regulation identifiers are lowercase strings from a non-normative registry (`gdpr`, `ccpa`, `lgpd`, etc.). Jurisdiction uses ISO 3166-1 alpha-2 / ISO 3166-2 codes.
  - Provenance hierarchy: `user` (browser settings) > `privacy_assistant` > `browser` (default).
  - `setRegulations()` emits `regulation_change` event. Clearing override (both fields null/empty) reverts to browser default.
  - Multiple regulations per page context (e.g. `["gdpr", "eprivacy"]`); see D-030.
- **Rationale**: enables regulation-aware behavior without requiring CMPs to build their own geolocation, and lets assistants correct for VPN or corporate policy scenarios.
- **Trade-offs accepted**:
  - Browser detection mechanism is implementation-defined (not standardized).
  - Introduces a new `"browser"` provenance source specific to regulation context (distinct from existing `"cmp"` / `"privacy_assistant"` / `"user"` provenance).
- **Follow-up changes**: RFC adds Section 6.7 (Regulation Context Methods), `RegulationInfo` type, `regulation_change` event, Appendix C (regulation registry), and corresponding shim/schema/TypeScript updates.

### D-030 Plural regulations field
- **Question**: Should `RegulationInfo` carry a single `regulation: string | null` or a plural `regulations: string[]`?
- **Why it matters**: regulation stacking is the norm, not the exception. In the EU, GDPR and ePrivacy both apply simultaneously to cookie consent. In other jurisdictions, sector-specific regulations may overlay general data protection law.
- **Decision**: Use plural `regulations: string[]`. Empty array means undetermined/none.
- **Decided behavior**:
  - `RegulationInfo.regulations` is `string[]` (empty array = undetermined).
  - `setRegulations()` accepts `regulations?: string[]` for override.
  - `browserDefault.regulations` is also `string[]`.
  - Clearing override: setting `regulations` to `[]` and `jurisdiction` to `null` reverts to browser default.
  - CMP consumption is straightforward: `regulations.includes("gdpr")`.
- **Rationale**: a singular value forces lossy representation from day one and changing from singular to array later is a breaking change. The array shape adds minimal complexity while correctly modeling real-world multi-regulation scenarios.
- **Trade-offs accepted**:
  - Slightly more complex type (`string[]` vs `string | null`), justified by accuracy.
- **Follow-up changes**: D-029 updated; RFC, shim, TypeScript types, and schema refactored from singular to plural.

### D-031 Regular vs contextual consent prompt handling
- **Question**: How does a consent assistant learn it should respond to a CMP's regular (first-visit) consent prompt, as opposed to a contextual `requestConsent()` call?
- **Why it matters**: `requestConsent()` is defined for contextual use — a specific vendor or purpose is needed to proceed. But there is no explicit trigger for the general consent prompt a CMP shows on first visit. Without a clear signal, the performance claim ("the assistant only steps up when a human would have been asked") may not hold in the regular case. The assistant needs to know *when* to act, not just *how*.
- **Context**: Raised during UserCentrics Q&A about performance impact. The claim that "an assistant always responds faster than a user" depends on the assistant knowing it should respond in the first place. For contextual needs, `requestConsent()` provides this trigger. For the regular first-visit case, the trigger mechanism is unclear.
- **Decision**: Reuse `requestConsent()` with empty/null scope as the general consent prompt signal (option B).
- **Decided behavior**:
  - A `requestConsent()` call with empty or null scope (`{ vendors: [], purposes: [] }` or equivalent) signals that the CMP is about to show its general consent prompt and gives the assistant an opportunity to handle it first.
  - The call follows the same Promise-based handshake as contextual `requestConsent()`: the CMP awaits resolution to learn whether the assistant applied preferences.
  - If the assistant applied preferences (fully or partially), the CMP inspects the resulting consent state and may skip or reduce its own UI accordingly.
  - If the assistant did not respond or the Promise resolved without changes, the CMP proceeds with its normal consent UI.
  - Contextual `requestConsent()` (non-empty scope) retains its existing semantics unchanged.
- **Rationale**: reuses existing API surface with zero new methods, provides an explicit handshake with a defined response window that solves the timing problem, and has minimal adoption cost since CMPs already implement `requestConsent()` for contextual needs. The semantic distinction (empty scope = general, non-empty scope = contextual) is a lightweight convention documented in the spec.
- **Trade-offs accepted**:
  - `requestConsent()` carries two semantic modes (general vs. contextual) differentiated by scope content — requires clear spec language to avoid implementer confusion.
  - Empty scope is an implicit convention (magic value) rather than an explicit intent declaration, which is less self-documenting than a dedicated method.
- **Follow-up changes**: RFC `requestConsent()` semantics updated to define empty/null scope behavior, shim updated, TypeScript types and integration guides adjusted.

## Decision log template (for each topic)

Use this mini-template when resolving a topic:

```md
### D-XYZ Title
- Decision:
- Rationale:
- Trade-offs accepted:
- Follow-up changes:
```
