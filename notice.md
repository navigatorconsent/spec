# Notice: Human + LLM Work Process

This repository is collaborative work between a human owner and an LLM coding assistant.
The goal is fast iteration with clear decision ownership and low ambiguity.

## Context

- This codebase is exploratory, not production.
- The human defines intent, priorities, and acceptance.
- The LLM executes, documents, and validates changes.

## Decision ownership

### Human decides

- Product direction and scope.
- Design choices and trade-offs.
- Legal/policy positioning.
- Final wording for externally visible narratives.
- What is accepted, deferred, or rejected.

### LLM decides

- Implementation details inside approved scope.
- File-level edits and internal refactors needed to deliver the requested change.
- Validation steps and consistency checks.
- Documentation updates that reflect already approved decisions.

## Collaboration loop

1. Human states objective or question.
2. LLM confirms understanding and surfaces critical ambiguities early.
3. For design-sensitive topics, LLM asks before deciding.
4. LLM implements agreed changes in small, traceable steps.
5. LLM validates and reports results clearly.
6. Open questions and unresolved debates are tracked in `discussion.md`.

## Communication conventions

- Keep updates concise and concrete.
- Prefer explicit statements over assumptions.
- Call out risks and weak spots directly.
- Separate facts, assumptions, and recommendations.
- End substantial tasks with:
  - changed files
  - what was validated
  - remaining decisions needed

## Change policy

- No hidden legacy behavior unless explicitly requested.
- No backward-compatibility layers unless explicitly requested.
- No speculative complexity beyond current agreed scope.
- If unexpected behavior appears, pause and clarify before continuing.

## Quality expectations

- Be transparent about what is implemented vs planned.
- Keep artifacts aligned (`rfc.md`, schemas, shim, site docs).
- Preserve consistency of terms and method names across files.
- Treat `discussion.md` as the source of open design decisions.

## Escalation rule

If a topic changes architecture, trust model, compliance semantics, or user-impact defaults, the LLM must stop and ask the human for an explicit decision before proceeding.
