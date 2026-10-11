# Design system

Pilovo 0.4.0 Preview opens on observed web activity. A row shows provider, non-sensitive local identity, evidence state and freshness. Focus and seen acknowledgment are separate actions. Mark all as seen appears only when two or more rows need attention, uses the same lock and inline error as rows and confirms through a refreshed snapshot. A discreet hint shows the configured next-attention shortcut and is hidden when none is assigned. Unknown remains explicit when evidence expires or is inaccessible. Manual preparations and historical receipts retain their own provenance in separate views.

The physical scene: a professional reviews an agent's work next to a document in a daylight office, moving between a narrow Chrome side panel and a full browser tab. Light mode uses a white canvas to match that working surface; dark and system modes support evening review without changing semantics.

The color strategy is restrained. OKLCH tokens use a deep olive accent anchored at hue 110 (palette seed 118), near-black ink, neutral gray divisions and pure white surfaces. Accent is reserved for primary actions, selection and meaningful status. Dark mode has separately chosen text, border and action values. Semantic errors and waiting states use text and shape as well as color.

One system sans-serif family, 14 px normal content and controls, 12 px metadata, and a restrained 24/20/14 px heading hierarchy. Narrow navigation stays at 12 px. No display typography, upper-case eyebrow scaffolding, gradients, glass, ornamental metrics or repeating feature card grids.

Desktop is a navigation rail, an attention/task list, and a detail pane separated by fine 1 px rules. Below 760 px, navigation becomes a five-item top row and selection opens a single detail view. Back and Escape restore the task-row focus. Lists, forms and long receipts scroll within their own view; source text and URLs wrap without executing or injecting HTML.

Actions use a common border, 6 px radius and icon vocabulary. Lucide React supplies all interface icons under ISC; source names are written out and the generic terminal/code symbols do not pretend to be official brand logos. Destructive actions and mission reassociation use native modal dialogs. Their focus is trapped by the browser and restored on close; mutation failures are announced inside the active dialog.

State design:

- Empty production state explains how actual tasks arrive; there is no seeded demo in product code.
- Current response-ready attention requires witnessed work and stable ready evidence; it never verifies task success. Historical completion remains labeled as agent-reported.
- Missing metadata is explicit. Derived duration uses source timestamps and is marked partial for missing/uncertain evidence.
- Prompts are collapsed and only appear if actually available under consent.
- Local SHA-256 check results show their scope, reference origin and time separately from overall verification and human review.
- No pause, stop, approval or notification control is exposed without support.

Transitions are 140–150 ms for controls and do not conceal initially visible content. Reduced motion removes transitions and the loading pulse. Keyboard navigation, visible focus, native form controls, explicit labels, live errors and 44 px coarse-pointer targets are part of the interface contract.

Historical 0.2.0 audit: initial supporting type was too small and dark rail states needed explicit color binding. Both were corrected. Browser tests then passed at 1365×900 and 360×800, including five axe WCAG AA scans. This does not validate the 0.4.0 activity screen. See `docs/ui-acceptance.md` and `docs/RELEASE.md` for scope and remaining manual checks.

## Pilovo identity

Public name: Pilovo. Signature: Keep your AI in view. Descriptor: AI activity for Chrome. Preview remains visible in promotional media. The native P monogram uses a round counter and activity point; six custom vector glyphs spell Pilovo. Ink `#20261F`, olive `#4B5D3A`, ivory `#F6F4EE` and limestone `#D9DDCF` define the media palette. See `docs/media/BRAND_GUIDELINES.md`.

Provider names remain plain text without implied endorsement. Abstract banner rows are editorial shapes; interface screenshots use synthetic local examples with explicit captions. No metrics, users or provider execution are fabricated. Internal database/native/protocol identifiers stay stable for compatibility.

