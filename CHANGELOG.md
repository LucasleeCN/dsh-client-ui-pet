# Changelog

## [0.1.0] - 2026-08-16

### Added

- Codex-style companion pet overlay for the DeepSeek Harness web UI:
  draggable pet, status bubble, state chip, interaction toolbar, and a
  5-tab customization panel (pets / look / behavior / raising / studio).
- Developer-defined `dshPetDefinition` schema: SVG mode with recolorable
  parts, per-state CSS keyframes, expression layers, behaviors, interactions,
  bubbles, and effects.
- `window.dshPet` developer API: register/unregister/list/select pets, set
  states, fire triggers, import/export definitions, and event subscriptions.
- JPG main-image pet mode (`mode: "raster"`): per-state image frames with
  built-in CSS motion, plus image-processing pipeline
  (`scripts/make-raster-pet.py`) for background removal, resizing, and WebP
  encoding, with `--embed` support for restart-free built-ins.
- Host-side asset routes at `/plugins/dsh-client-ui-pet/assets/*` and a
  matching preview-server mapping.
- Activity signals from the Harness web UI (composer typing, stop button,
  `[data-streaming]`, `[data-state="running"]`, `[data-error]`).
- Light raising stats: mood, affinity, and interaction counters persisted per
  pet in `localStorage`.
- Standalone preview page, raster rendering demo, CDP live-verification
  probes, and a 17-case automated test suite.
- Built-in `deepseek-whale` pet generated from user-provided state images
  (8 states: idle / typing / thinking / working / done / error / happy / eat).
