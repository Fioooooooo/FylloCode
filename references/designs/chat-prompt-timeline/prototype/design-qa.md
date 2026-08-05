# Adaptive Prompt Timeline Prototype · Design QA

- source visual truth path: `/private/tmp/fyllocode-timeline-audit/01-chat-61-turns.jpeg`
- implementation screenshot path: `/private/tmp/fyllocode-timeline-prototype/implementation-61-prompts.png`
- viewport: requested `1295 × 768`; browser-rendered capture `1197 × 768`
- source pixels: `1294 × 768`
- implementation pixels: `1197 × 768`
- CSS size and density: desktop viewport, device scale factor `1`; both captures compared at original height and visually normalized by the same displayed width in one comparison input
- state: light theme, `61 prompts`, timeline at the start of the conversation, popover closed

## Full-view comparison evidence

The source and implementation were opened together in the same comparison input. The prototype preserves the current FylloCode light desktop language: white content surfaces, slate text, teal current-state color, low-contrast borders, restrained shadows, compact system typography, right-aligned user messages, and a floating composer. The prototype intentionally removes the global Activity Bar and Event Rail from the comparison scope so the timeline behavior remains legible.

The current `61 turns` timeline renders a dense one-line-per-prompt rail. The implementation replaces it with ten evenly distributed guide ticks and one independent teal active thumb while retaining all 61 prompts in the interaction model.

## Focused interaction evidence

No additional crop was needed because the timeline and popover remain readable at the captured desktop scale. Browser checks confirmed:

- `8 prompts`: 8 guide ticks, `98px` rail height.
- `24 prompts`: 10 guide ticks, `164px` rail height.
- `61 prompts`: 10 guide ticks, `164px` rail height.
- Hover preview: exactly 5 nearby one-line summaries.
- Click/Enter pinned state: 61 summary rows in a `292px` scroll viewport with `2084px` scroll content.
- Keyboard navigation: Arrow navigation and Enter open the pinned list.
- Summary selection updates the slider value and locates the corresponding message.
- Browser console errors: none.

## Required fidelity surfaces

- Fonts and typography: system UI stack, compact 10–13px supporting text, restrained weights, single-line summary truncation, and message line height match the current product direction.
- Spacing and layout rhythm: the timeline is absolutely positioned over the chat stage and does not reduce the message scroller or composer width; popover rows use a stable 34px rhythm; composer and chat header retain the source hierarchy.
- Colors and visual tokens: white/slate surfaces and teal active state align with FylloCode semantic tokens; hover uses background and border changes only.
- Image quality and assets: the focused prototype contains no raster imagery or non-standard icons requiring replacement; functional tick and thumb primitives are native controls rather than decorative assets.
- Copy and content: labels directly explain prototype-only interactions; prompt summaries use realistic Chinese product-design content and one-line ellipsis.

## Comparison history

### Iteration 1

- [P2] Switching from the 8-prompt scenario to 61 prompts retained the previous message scroll anchor, so the active thumb could start around prompt 6 instead of prompt 1.
- Fix: disabled scroll anchoring for the message scroller and reset scroll position after message rendering on every scenario change.
- Post-fix evidence: the final 61-prompt capture starts at `01 / 61` with the active thumb at the first guide position.

### Iteration 2

- [P1] The standalone prototype placed the timeline in a dedicated `68px` column, unlike the production component's absolute floating placement, so it unnecessarily reduced the message area.
- Fix: moved the timeline to a `46px` absolute overlay at the chat stage's left inset; restored the message scroller and composer to full width.
- [P2] A permanently visible timeline surface would still feel like a narrow sidebar.
- Fix: the timeline surface is fully transparent at rest and shows a subtle `78%` translucent, blurred surface only during hover, focus, or drag. The popover remains opaque for legibility.
- Post-fix evidence: browser layout checks report identical `914px` stage and message-scroller widths, `position: absolute`, transparent rest background/border, and a visible hover popover with no console errors.

## Follow-up polish

- [P3] Dark theme and narrow-window variants are intentionally out of scope until the interaction direction is accepted.

final result: passed
