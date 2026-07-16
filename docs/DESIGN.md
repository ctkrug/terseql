# Terseql — design direction

## 1. Aesthetic direction

**Blueprint/technical.** Terseql is a precision instrument, not a toy: you're staring at a
schema like an engineer staring at a drawing, hunting for the shortest correct path through it.
The page reads like a drafting table — deep blueprint-navy background, cyan linework, a
faint grid, crosshair accents — with the query editor and result table treated as the
instrument panel the whole page is built around. This is deliberately NOT a dark-gray-cards
theme: the navy has real blue saturation, the grid and linework give it texture no flat panel
has, and the cyan accent is used sparingly, like ink on a drawing, not as a UI-chrome color.

## 2. Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0b1220` | page background (deep blueprint navy) |
| `--surface-1` | `#101a30` | panels (editor, puzzle card) |
| `--surface-2` | `#16233f` | raised elements (result table header, modals) |
| `--text` | `#e8eefc` | primary text |
| `--text-muted` | `#8ea0c4` | secondary text, labels, comments |
| `--accent` | `#5ee1ff` | primary accent — cyan linework, active states, byte counter |
| `--accent-support` | `#ffb454` | support accent — amber, used for "your best" / highlights only |
| `--success` | `#4ee08a` | passing tests, correct query |
| `--danger` | `#ff6b6b` | failing tests, syntax errors |
| `--grid-line` | `rgba(94, 225, 255, 0.06)` | background blueprint grid |
| Display font | **Space Grotesk** (Google Fonts) | wordmark, headings, puzzle title |
| UI font | **JetBrains Mono** (Google Fonts) | query editor, byte counts, table data, body copy |
| Spacing unit | `4px` base, scale: 4/8/12/16/24/32/48/64 | all margins/padding |
| Corner radius | `6px` small controls, `10px` panels | buttons, inputs, cards |
| Shadow / glow | `0 0 0 1px var(--grid-line), 0 8px 24px rgba(0,0,0,0.4)` panel edge; `0 0 12px rgba(94,225,255,0.35)` on focus/active | panel depth + focus glow |
| Motion | UI transitions 150ms ease-out; byte-count digit roll 90ms ease-out; result-table row-in 110ms ease-out | all interactive motion |

Both fonts load with system-monospace / system-sans fallbacks so the page never blocks on
font load or breaks without network access.

## 3. Layout intent

The hero is the **query editor + live result table**, stacked as one instrument panel that
takes the majority of the viewport.

- **Desktop (1440×900):** three-column grid — puzzle prompt + schema reference (left, ~22%),
  editor + result table (center, ~56%, the hero), leaderboard + byte counter (right, ~22%).
  The center column alone is >55% of viewport width and the editor+results together fill
  ≥65vh. A thin animated grid pattern sits behind everything at low opacity.
- **Phone (390×844):** single column, reordered so the editor is immediately below the puzzle
  prompt (prompt collapsed to 2 lines with a "view schema" expand), taking ~60vh; results below
  it; leaderboard and byte counter collapse into a sticky bottom bar so the score is always
  visible without scrolling away from the editor.

No dead space: the blueprint grid + corner crosshair ticks fill background area that would
otherwise be empty navy.

## 4. Signature detail

The **live byte counter**: a monospace digit readout styled like an instrument dial (crosshair
ticks either side), which visibly rolls digit-by-digit as you type or delete in the editor —
this is the moment described in the wow spec ("byte count ticking down live as you trim it").
It's the one element every puzzle page shares and the thing a screenshot of Terseql is
recognized by.

## 5. Juice plan (query submission is the "move")

- **Keystroke feedback:** byte counter updates within one frame of every edit; digits that
  change roll (90ms ease-out) rather than snapping.
- **Run feedback:** pressing Run (or Cmd/Ctrl+Enter) gives an immediate pressed state on the
  button (<100ms) before the result table populates; rows animate in top-to-bottom (110ms
  stagger).
- **Impact feedback (wrong answer):** the result panel edge flashes danger-red for one beat and
  the failing row(s) in the diff view get a brief shake; a compile/syntax error underlines in
  the editor.
- **Goal feedback (right answer, not yet submitted):** result panel edge pulses success-green
  once.
- **Win celebration (submit a passing query):** an overlay shows byte count, today's rank, and
  delta vs. yesterday's best, with a short particle burst of cyan/amber motes from the byte
  counter; CTA is "Copy share card" (Wordle-style emoji-grid text, no image).
- **Synth SFX (WebAudio-generated, no audio files):**
  - *keystroke*: near-silent 20ms tick, filtered noise, only on byte-count digit change (throttled)
  - *run*: short rising sine blip, 80ms
  - *fail*: low detuned square-wave buzz, 150ms
  - *pass*: two-note ascending sine chime, 220ms
  - *win (submit)*: three-note major arpeggio, 400ms
  - Mute toggle in the top bar, state persisted to `localStorage`; `AudioContext` created lazily
    on first user gesture; all SFX calls no-op safely if `AudioContext` is unavailable (tests,
    unsupported browsers).
- Respect `prefers-reduced-motion`: disable shake/particle/roll animations, keep color-flash
  and sound (sound is separately mutable).
