# Design system

The physical scene: a professional reviews an agent's work next to a document in a daylight office, moving between a narrow Chrome side panel and a full browser tab. Light mode uses a white canvas to match that working surface; dark and system modes support evening review without changing semantics.

The color strategy is restrained. OKLCH tokens use a deep olive accent anchored at hue 110 (palette seed 118), near-black ink, neutral gray divisions and pure white surfaces. Accent is reserved for primary actions, selection and meaningful status. Dark mode has separately chosen text, border and action values. Semantic errors and waiting states use text and shape as well as color.

One system sans-serif family, 14 px normal content and controls, 12 px metadata, and a restrained 24/20/14 px heading hierarchy. Narrow navigation stays at 12 px. No display typography, upper-case eyebrow scaffolding, gradients, glass, ornamental metrics or repeating feature card grids.

Desktop is a navigation rail, an attention/task list, and a detail pane separated by fine 1 px rules. Below 760 px, navigation becomes a five-item top row and selection opens a single detail view. Back and Escape restore the task-row focus. Lists, forms and long receipts scroll within their own view; source text and URLs wrap without executing or injecting HTML.

Actions use a common border, 6 px radius and icon vocabulary. Lucide React supplies all interface icons under ISC; source names are written out and the generic terminal/code symbols do not pretend to be official brand logos. Destructive actions and mission reassociation use native modal dialogs. Their focus is trapped by the browser and restored on close; mutation failures are announced inside the active dialog.

State design:

- Empty production state explains how actual tasks arrive; there is no seeded demo in product code.
- Completion is labeled as agent-reported; disconnected transport never rewrites execution.
- Missing metadata is explicit. Derived duration uses source timestamps and is marked partial for missing/uncertain evidence.
- Prompts are collapsed and only appear if actually available under consent.
- Local SHA-256 check results show their scope, reference origin and time separately from overall verification and human review.
- No pause, stop, approval or notification control is exposed without support.

Transitions are 140–150 ms for controls and do not conceal initially visible content. Reduced motion removes transitions and the loading pulse. Keyboard navigation, visible focus, native form controls, explicit labels, live errors and 44 px coarse-pointer targets are part of the interface contract.

Observed audit: initial supporting type was too small and dark rail states needed explicit color binding. Both were corrected. Automated browser tests then passed at 1365×900 and 360×800, including five axe WCAG AA scans with no reported violations. See `docs/ui-acceptance.md` for scope and limits; automated accessibility checks are not a substitute for a screen-reader and live Chrome panel review.

## Briefoak identity

Public name: Briefoak. Descriptor: A local prompt desk for Claude & ChatGPT. The name evokes a brief and a durable place to keep related work. The geometric B mark is an independent product identity; provider names remain plain text without implied endorsement. Actual interface screenshots use fictional local examples and identify the browser-preview context. Retain internal database/native identifiers for compatibility; branding does not change the data contract.

