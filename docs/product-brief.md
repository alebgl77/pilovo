# Briefoak 0.3.0 — current product brief

## User and job

Audience to test: independent consultants and writers comparing or combining Claude and ChatGPT in their own web accounts. Job: prepare briefs in one place and maintain a personal record of follow-through without giving an extension access to conversation content.

This positioning is a hypothesis. Other extensions already offer local workspaces and cross-provider organization. Briefoak does not claim to be first, unique, more popular or more secure than those tools.

## Shipped scope

- Local preparations with explicit per-record prompt retention, off on creation.
- Separate copy and provider navigation; the user pastes and sends.
- Human-declared sent/completed states, notes and missions.
- Optional tab metadata for exact Claude/ChatGPT origins; no page content access.
- Side panel/full page, French/English, themes, search, JSON export, deletion and retention.
- Historical receipts retained with provenance; native transport disabled.

No model API, backend, telemetry, conversation reader, unattended execution, account detection, result verification, import or sync. Provider rules and quotas apply. Storage and exports have no application-level encryption.

## Acceptance boundaries

Copy/open/focus do not change status. A refused/revoked permission keeps official navigation available. One preparation's retention choice is not inherited by the next. Stale edits cannot restore erased prompts. Fresh production profiles have no fabricated records. Export schema 2 and IndexedDB version 4 preserve the distinction between web preparations and historical receipts.

The manifest requires only `storage`, `sidePanel`, `alarms`, with optional hosts `https://claude.ai/*` and `https://chatgpt.com/*`. No content scripts or native companion ship in the Chrome archive. [Core contract](core-contract.md) describes persistence and navigation; [Release checks](RELEASE.md) records evidence and remaining manual review.

## Brand and distribution

Name: Briefoak. Descriptor: **A local prompt desk for Claude & ChatGPT.** English primary documentation, French companion guide. GitHub repository and manually loaded Chrome ZIP are the first distribution surfaces. Store submission and broader launch remain proposed work.

The name was selected after a preliminary public search found no exact match in the checked sources. This is not a trademark clearance or guarantee of exclusivity. No domain ownership, affiliation or provider endorsement is claimed.
