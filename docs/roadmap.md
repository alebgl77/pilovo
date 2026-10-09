# Roadmap

This is a proposed direction, not a delivery commitment. Requests and evidence can change the order.

The [activity manager PRD](activity-manager-prd.md) is the authoritative future product target and priority order: observed web activity and focus first, validated agent connectors next, then supported commands. It replaces manual preparation as the product vision. None of those live activity capabilities is implemented in 0.3.0; integration coverage remains conditional on verified signals and contracts.

| Available in 0.3.0 | Other proposed follow-ups |
| --- | --- |
| Prepare/copy/open and manually track work | Observe first-run usability with a small group of volunteers |
| Local notes, missions, search and JSON export | Study whether export-only recovery is sufficient before designing import |
| Optional exact-site tab discovery | Finish real permission grant/denial/revocation review across supported Chrome versions |
| French/English and light/dark/system UI | Manual screen-reader, zoom and keyboard review; improve labels from reports |
| GitHub source and unpacked ZIP workflow | Consider Chrome Web Store submission after publisher and review requirements are ready |

Automatic sending, reading conversations, agent orchestration, team sync and hosted accounts are outside the current release scope. Any implementation of the new target must address permissions, privacy and the existing manual workflow before release, as required by the PRD.
