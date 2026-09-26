# Hyperframes Composition Brief: PulseQuiz

## Objective
Create a short launch-style brag video for PulseQuiz, a store-ready mobile quiz game with
sudden-death Ranked runs, live 1v1, weekly leagues and USDT/USDC prizes decided by skill alone.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 23 seconds

## Source Material
- Project root: `/Users/bonhomie/Documents/DEV/mobile/pulsequiz`
- Primary files read: `mobile/app.json`, `mobile/src/theme/colors.ts`, `mobile/src/constants/leagues.ts`,
  `mobile/app/onboarding.tsx`, `mobile/app/(tabs)/home.tsx`, `mobile/app/quiz/mode.tsx`,
  `mobile/app/quiz/play.tsx`, `mobile/app/quiz/result.tsx`, `mobile/app/quiz/pvp/vs.tsx`,
  `mobile/src/components/RulesSheet.tsx`, `docs/STORE-SUBMISSION.md`, `server/question-bank/*.json`
- Product name: PulseQuiz
- Tagline / strongest claim: "Top players are paid in USDT or USDC." and "One wrong answer ends the run."
- Key UI or visual moment to recreate: the Ranked play screen (`play.tsx`) with the timer pill, question
  card, four option cards, Hint / coins / +10s / Quit footer, and the "Correct ✅ / Keep going!" overlay;
  the 1v1 VS screen (`vs.tsx`) with two player cards, the pulsing "VS" and the 3-2-1 countdown.
- Copy that must appear verbatim:
  - "Ten questions." / "Fifteen seconds each." / "One wrong answer ends the run."
  - "Which civilisation built Machu Picchu?" with options "The Inca" / "The Olmec" / "The Aztec" / "The Maya"
  - "Correct ✅" and "Keep going!"
  - "1v1 Live." and "Real opponent. Same questions. Speed matters."
  - "Weekly leagues." and "Finish on top to move up a league."
  - Bronze, Silver, Gold, Platinum, Diamond, Master, Legend (with their emoji and LEAGUE_STYLE colours)
  - "Top players are paid in USDT or USDC." and "Skill only. No purchase necessary. 18+."
  - "PulseQuiz" and "Decided by skill alone."

## Creative Direction
- Tone preset: cinematic
- Creative direction: a mobile game trailer. Sudden-death tension first, the real-money payoff second,
  everything in the app's own words.
- Interpretation: heavy type, one claim per beat, scale-and-blur reveals rather than quick cuts, a
  phone-frame demo as the centerpiece, restrained weighted SFX, no invented superlatives.
- Angle: see `brag-plan.md` → "The angle". The rules are the hook, the working app is the proof, the
  prize line is the payoff, the fine print is the honesty.
- Hook: three stacked rule lines slamming in on the beat over a thin pulse line drawing across the frame.
- Outro / punchline: app icon + "PulseQuiz" wordmark, then "Decided by skill alone." Hold on the lockup.
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign (keep the app's dark palette and rounded-card UI)
  - Real usernames, wallet data or emails (fictional stand-ins "Amara" and "Tobi" only)

## Visual Identity
- Background: #0B0F1A · surface #131A2E · surface-alt #1A2238 · border #1F2937
- Text: #FFFFFF · muted #A6B0CF
- Accent: primary #5B7CFF · mint #2EF2B3 · violet #7C3AED · coin #FFC94A · success #4ADE80 (use the
  app's accessible light-theme success #0F7A3D wherever white text sits on green) · danger #FF7A85
- Display font: Montserrat 900 (bundled; the closest bundled relative of the app's 900-weight system sans)
- Body font: Montserrat 700 for sub-lines; Inter 400/700/900 inside the phone mock-up to match the
  app's system-font UI
- Visual references from the project: `assets/img/icon.png` (app icon), `assets/img/avatar1.png` and
  `assets/img/avatar3.png` (bundled avatars), LEAGUE_STYLE tier colours, the onboarding prize-slide
  gradient (#7C3AED → #5B7CFF)

## Storyboard
Use the storyboard in `brag-plan.md` as the creative contract.

Scene summary:
1. The rules — 4.6s — three rule lines slam and stack; pulse line draws behind
2. The run — 5.4s — phone with the Ranked play screen; timer ticks to red; tap "The Inca"; green + "Correct ✅ / Keep going!"; left copy "Ranked." / "Server-checked answers." / "The app never receives the answer key."
3. 1v1 Live — 3.8s — VS screen: cards slide in, "VS" pops, 3-2-1 countdown
4. Weekly leagues — 3.6s — headline, sub-line, seven tier chips pop in left to right
5. Prizes — 3.0s — "Top players are paid in USDT or USDC." slams; fine print beneath
6. Outro — 2.6s — icon + wordmark + "Decided by skill alone."; music fades under the lockup

## Audio
- Audio role: cinematic support
- Audio arc: bed from frame one, three weighted hits (rule 3, correct verdict, prize line), quiet UI clicks
  on the tap and countdown, a bell on the logo, one-second fade under the lockup
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`
- Music treatment: volume 0.34, 0.3s fade-in, fade-out 22.0→23.0s via the `data-automation` volume lane
- Music cue guidance: bundled preset `assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`
  (109.96 BPM). Beat-lock: correct verdict 8.74s, countdown "1" 13.11s, prize slam 17.47s. Beat grid for
  the hook lines (0.56 / 1.64 / 2.73), VS cards (10.37) and VS pop (10.93), countdown (12.02 / 12.55 /
  13.11), league chips from 14.73 at half-beat spacing, logo 20.75, tagline 21.84.
- Audio-reactive treatment: subtle; pre-extracted RMS/bass (`assets/music/audio-data.js`, 30fps, first
  24s) drives the opacity and scale of the radial glow behind the phone, the VS lockup and the logo
  (±8%, peak opacity ≤ 0.42). No text pulsing, no waveforms.
- Audio-coupled moments:
  - Hook lines — impact on each slam, heavier on the third
  - Tap on "The Inca" — click; green flip — bell
  - VS cards — card slide; "VS" — soft impact; countdown — three clicks
  - League chips — soft drop on first and last only
  - Prize slam — heavy soft impact
  - Logo landing — bell
- SFX selection guidance: low-HF-risk impacts (`impactSoft_medium_001`, `impactSoft_heavy_003`), bells
  (`impactBell_heavy_000/003`), clicks (`click_002/003`), `drop_001`, `card-slide-1`; all copied to
  `assets/sfx/`. One SFX per beat at most; sub-lines silent.
- SFX analysis guidance: `<skill-dir>/assets/sfx/sfx-analysis.md` (safest picks used above)
- Exact SFX choice: chosen against the implemented animation; each on its own track index (11+), music on 10.
- Audio files: already copied into `brag-output/composition/assets/`

## Hyperframes Instructions
Domain skills loaded: hyperframes-core, hyperframes-animation (kinetic-beat-slam, spring-pop-entrance,
cursor-click-ripple, ambient-glow-bloom, svg-path-draw, CSS transitions: zoom-through, directional blur,
blur crossfade), hyperframes-creative (audio-reactive, beat direction, typography), hyperframes-keyframes,
hyperframes-cli. /brag is its own workflow; no intent interview.

Requirements:
- Show at least one real UI, copy, or visual element from the source project (scenes 2 and 3).
- Keep all text readable in the final render (reading floors in the plan).
- Keep the video within 15-25 seconds (23s).
- Include the planned music/SFX layer.
- Treat cue metadata as timing hints; readability wins.
- Run `npx hyperframes check` before render — brag's single gate.
