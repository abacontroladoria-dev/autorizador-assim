# Product

## Register

product

## Users

Individual therapy professionals at Universo ABA clinic marking their session availability in real time. Users are therapists who need to quickly report whether they're available to conduct scheduled sessions or unavailable/on substitute coverage.

## Product Purpose

Single-source-of-truth availability tracker where therapists confirm or flag their readiness for each scheduled 40-minute therapy session throughout the workday (08:00–17:40). Data syncs to a central management view used by clinic managers to oversee coverage, identify staffing gaps, and trigger substitute assignments when needed.

## Brand Personality

Professional, decisive, clinical. Calm under pressure. The interface removes friction so therapists can stay focused on their work; clarity and speed matter more than elaboration.

## Anti-references

- Overly complex multi-step flows (therapists are busy; one or two taps per status change).
- Murky status labels or unclear visual feedback (clinical decisions depend on knowing the current state).
- Mobile-hostile layouts despite PWA capability (therapists often work from mobile devices on the floor).
- Calendar/schedule views that hide the therapy detail underneath (show each session so therapists confirm what they're reporting on).

## Design Principles

1. **Clarity under time pressure** — Visual design, labels, and status indicators must work instantly, not requiring reading or interpretation. Color, badge shape, and position reinforce state.
2. **Mobile-first, touch-friendly** — Large targets (44px+ height), generous spacing, scrollable cards, no hover-only interactions.
3. **Actionable granularity** — Show enough session detail (patient name, time, room, therapy type) that therapists confirm they're reporting on the right thing; batch operations by therapist when safe.
4. **Sync transparency** — Indicate when data is stale, syncing, or out of date so therapists never guess whether their change took.

## Accessibility & Inclusion

WCAG 2.1 AA minimum. Particular attention to color contrast (status badges must pass 4.5:1 body text, 3:1 large text), keyboard navigation (all interactions reachable without mouse), and form labels (date picker, sort dropdowns, search must be properly marked).
