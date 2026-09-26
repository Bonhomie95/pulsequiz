# Hyperframes Composition Brief: PulseQuiz (v2)

## Objective
Re-roll of the PulseQuiz brag video per the user's direction (see brag-plan.md → "What changed").

## Output
- Composition directory: `brag-output-2026-09-24-135412/composition/`
- Rendered video: `brag-output-2026-09-24-135412/brag.mp4`
- Format: landscape — 1920x1080 · Duration: 20 seconds

## Source Material
Same files as v1 plus `mobile/app/(tabs)/leaderboard.tsx`, `mobile/src/components/PlayerRow.tsx`,
`mobile/src/constants/leaderboard.ts`. Copy that must appear verbatim: the three rules; the Machu
Picchu question and options; "Correct ✅" / "Keep going!"; "1v1 Live." and its sub-line; "Weekly
leagues." / "Finish on top to move up a league."; the seven tier names; "Leaderboard", "WEEKLY PAYOUT",
"Prizes paid to top players every week", tabs Weekly / Monthly / All Time / Friends; "Top players are
paid in USDT or USDC."; "Skill only. No purchase necessary. 18+."; "PulseQuiz"; "Decided by skill alone."

## Creative Direction
Cinematic game trailer. Phone as hero with a continuous slow push-in. Hard cuts (one whip at 2→3) so
text from two scenes never shares a frame. Every scene carries a slow scale drift plus its own
sequential events. Three real screens: Ranked play, VS countdown, weekly leaderboard.

## Visual Identity
As v1 (dark palette, Montserrat 900 display, Inter in-screen UI, LEAGUE_STYLE colours, bundled avatars).

## Storyboard
Six scenes, 3.8 / 5.6 / 3.2 / 2.4 / 3.2 / 1.8 s, per brag-plan.md.

## Audio
Vol-12 bed at 0.34 with a volume lane (0.3s in, fade 19→20). SFX on their own lanes (11+). Beat locks:
8.74 verdict, 12.02 countdown "1", 16.38 prize slam. Audio-reactive glow from `assets/music/audio-data.js`.

## Hyperframes Instructions
Domain skills loaded as in v1. Single monolithic composition, one paused GSAP timeline, timed scene clips
with no overlap except the 0.25s whip. `npx hyperframes check` is the gate before render.
