# Ported from bloub

The files in this directory (`decor.ts`, `expressions.ts`, `eyefit.ts`,
`face.ts`, `math.ts`, `shape.ts`, `skins.ts`, `profiles.ts`, `states.ts`,
`engine.ts`) are the framework-agnostic core engine of
[bloub](https://github.com/jeremy-prt/bloub) by Jérémy Perret, copied
unmodified per the project constitution's Component & UI Standards (the
core engine has no Vue dependency — it is pure, deterministic TypeScript —
so only the rendering layer needed a React port; see
`specs/001-live-monitor-dashboard/research.md` decision 6).

MIT License, Copyright (c) 2026 Jérémy Perret. See the upstream repository
for the full license text.
