# Contributing to Pilovo

Start with a focused [issue](https://github.com/alebgl77/pilovo/issues) describing the problem and expected result. Search existing reports first. For larger changes, discuss the scope before implementing.

Good first contributions include a contextual French/English label correction, a reproducible keyboard navigation problem, or a permission denial/revocation observation with the Chrome version. These are suggestions, not claims that labeled issues already exist.

Use Node.js 22.12+, run `npm ci`, then `npm run typecheck`, `npm test`, `npm run test:publication` and `npm run build`. `npm run dev` previews the UI; load `dist/` in Chrome for extension behavior. Read [PRODUCT](PRODUCT.md) and the [contract](docs/core-contract.md) before changing a user-facing boundary.

Keep changes narrow and add a regression test for a bug. Explain what changed, how it was tested and any remaining limitation. Never include real prompts, exports, profiles, credentials or personal paths in an issue, screenshot, fixture or commit. Screenshots should use fictional content and say so.

Preserve the distinction between tab presence, a human statement and provider execution evidence. Do not add telemetry, broad host permissions or automatic submission without a separately reviewed scope proposal. Internal legacy database/native identifiers intentionally keep their names for compatibility.

The `companion/` directory and native tests/scripts are historical reference, not the default product. See [Release checks](docs/RELEASE.md) for what is shipped. Be respectful, describe behaviors rather than attacking people, and keep discussion relevant. Maintenance and reviews are best-effort, with no guaranteed response time.

Pilovo uses the [MIT license](LICENSE). Submit only changes you have the right to contribute under that license. Third-party components retain their respective licenses.
