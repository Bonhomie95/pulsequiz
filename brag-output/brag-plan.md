# Brag Plan: PulseQuiz

## What is this app?
PulseQuiz is a store-ready Expo/React Native quiz game: 10-question sudden-death Ranked runs on a
server-enforced 15-second clock, live 1v1 matches, async friend challenges, a daily quiz, weekly
leagues from Bronze to Legend, and real USDT/USDC prizes for the top Ranked players, decided by
skill alone (hints and extra time earn zero leaderboard points).

## The angle
A mobile game trailer that takes the app's own rules seriously. The hook is the tension the
product itself creates ("One wrong answer ends the run"), the middle shows the game being played
and a live 1v1 lining up, and the payoff is the one claim that separates this from every other
quiz app: real crypto prizes, with the honest fine print the app already prints. Every line on
screen is copy from the app (rules sheet, mode picker, onboarding), not marketing invented for
the video.

## Hook (first 2-3 seconds)
Three lines slam in one after another on the app's dark navy and stack:
"Ten questions." / "Fifteen seconds each." / "One wrong answer ends the run."
Behind them a thin white pulse line (the icon's ECG mark) draws across the frame once.

## Key moments (the middle)
- The Ranked play screen, recreated from `mobile/app/quiz/play.tsx` in the dark theme, with the
  timer pill ticking down and turning red at 5s, a tap on "The Inca", the option flipping to
  success green and the "Correct ✅ / Keep going!" overlay sliding up.
- The 1v1 "VS" screen from `mobile/app/quiz/pvp/vs.tsx`: two player cards slide in from opposite
  sides, "VS" pulses in primary blue, then the 3-2-1 countdown bumps in.
- The seven league tiers (Bronze → Legend) popping in as coloured chips, then the prize line:
  "Top players are paid in USDT or USDC." with "Skill only. No purchase necessary. 18+." beneath.

## Outro / punchline
App icon scales in with a glow, "PulseQuiz" wordmark beside it, then the tagline lifted from the
rules sheet: "Decided by skill alone." Music fades under the lockup. End on the lockup, not black.

## User flow worth showing
Start a Ranked run → answer under the 15-second clock (tap → server verdict → "Correct ✅ Keep
going!") → queue a 1v1 and watch the VS countdown → climb the weekly league → top Ranked players
get paid. Scenes 2 and 3 are the working app; scenes 4 and 5 are the consequence.

## Tone
- Preset: cinematic
- Creative direction: a mobile game trailer. Sudden-death tension first, the real-money payoff
  second, everything in the app's own words.
- Interpretation: big heavy type, one claim per beat, dramatic scale-and-blur reveals rather than
  quick cuts, a phone-frame demo as the centerpiece, restrained SFX (three big hits plus quiet UI
  clicks), and no invented superlatives. Confidence comes from stating the rules plainly.

## Format: landscape — 1920x1080
## Duration: 23 seconds

## Visual identity (from the project)
- Background: #0B0F1A (dark theme `background`)
- Surface: #131A2E, surface-alt #1A2238, border #1F2937
- Accent (primary): #5B7CFF; secondary/mint #2EF2B3; violet #7C3AED (onboarding gradients)
- Coin gold #FFC94A; success #4ADE80; danger #FF7A85; warning #FBBF24
- Text: #FFFFFF; muted #A6B0CF
- League tier colours (LEAGUE_STYLE): Bronze #8B5530, Silver #56657A, Gold #8A6508,
  Platinum #23706F, Diamond #3F57C9, Master #7C3AED, Legend #C2410C
- Display font: the app uses the platform system sans at weight 900 (SF Pro on iOS). Use
  `-apple-system, "SF Pro Display", Inter, system-ui, sans-serif` at 800-900.
- Body font: same family at 600-700.
- Strongest visual element: the Ranked play screen (question card + four option cards + timer
  pill + Hint/+10s/coins footer) and the app icon (white pulse line on a #3F57C9→#2EF2B3 gradient).
- Assets staged in `composition/assets/img/`: `icon.png`, `avatar1.png`, `avatar3.png`
  (the app's own bundled avatars).

## Privacy
No real usernames, emails, or wallet data appear. The two 1v1 players are fictional stand-ins
("Amara", "Tobi") with the app's bundled avatar art. Coin balance, ranks and levels are invented
plausible values.

## Share copy (draft)
PulseQuiz: ten questions, fifteen seconds each, one wrong answer ends the run. Ranked, Practice,
1v1 Live and weekly leagues, and top Ranked players are paid in USDT or USDC. Skill only, no
purchase necessary.

## Audio direction
- Role: cinematic support. A steady bed under big type, three weighted hits, quiet UI clicks
  where the demo shows a tap or a countdown.
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (109.96 BPM, "steady and
  clean"), copied to `composition/assets/music/`.
- Music treatment: start at 0, volume 0.34, 0.3s fade-in, 1.0s fade-out over the final lockup
  (22.0→23.0s).
- Music cue guidance: preset read from
  `composition/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.json`.
  Strong cues to lock: 8.74s (correct answer lands), 13.11s (countdown "1"), 17.47s (prize line
  slams). Beat grid for sequential events: hook lines at 0.56 / 1.64 / 2.73; VS cards at 10.37,
  "VS" at 10.93, countdown at 12.02 / 12.55 / 13.11; league chips from 14.73 at half-beat spacing
  (~0.27s); logo at 20.75, tagline at 21.84.
- Audio-reactive treatment: subtle. A radial glow layer behind the phone, the VS lockup and the
  logo breathes with bass/RMS (opacity and scale within ±8%). No text pulsing, no waveforms.
- SFX posture: sparse and weighted. Low-HF-risk impacts for the three big hits, low-risk clicks
  for the tap and countdown, one drop for the first and last league chip.
- Audio-coupled moments: hook line slams; tap → click; correct verdict → bell; VS cards → card
  slide; countdown ticks → clicks; prize slam → heavy soft impact; logo → bell.
- Restraint rule: never more than one SFX per beat, nothing on the chips except first and last,
  no sound on the sub-lines, and the music never rises above 0.34.

## Storyboard

### Scene 1 — The rules — 4.6s (0.0→4.6)
Dark navy #0B0F1A, full frame. A thin white pulse line (the icon's ECG shape) draws itself across
the lower third from left to right over the first 1.2s at ~18% opacity, then holds. Three lines
of heavy white type slam in (scale 1.15→1, blur 12px→0, ~0.25s each) and stack, centred:
- 0.56s "Ten questions." (96px)
- 1.64s "Fifteen seconds each." (96px)
- 2.73s "One wrong answer ends the run." (120px, held to 4.6s = 1.9s settled)
Sequential/interaction: yes, three lines one by one on beats, all remain on screen.
Audio intent: weight and threat. Each line lands like a stamp.
Audio-coupled idea: impact on each slam, the third heavier.
Music: bed enters at 0 with a short fade-in.
Transition mood: dramatic (velocity-matched blur/scale zoom-through) → Scene 2

### Scene 2 — The run — 5.4s (4.6→10.0)
A phone frame (dark bezel, ~400×866 on screen, rounded) enters from the right with scale
0.92→1 and blur clearing (4.6→5.1s) and sits right of centre. Inside it, the Ranked play screen
recreated from `play.tsx`: top bar with a "History" pill and an amber "MEDIUM" pill, a 4/10
progress ring and avatar on the right; "Question 4 of 10" and a timer pill; a question card
"Which civilisation built Machu Picchu?"; four option cards "The Inca" / "The Olmec" /
"The Aztec" / "The Maya"; footer with a blue "Hint · 10 coins" button, a "💰 240" pill, "+10s ·
20 coins" and "Quit". The timer pill ticks 10s → 5s (about 0.7s per tick); at 5s the pill's text
and border turn danger red. At 8.6s a soft tap indicator presses "The Inca" (scale 0.98); at
8.74s (beat-locked) the option flips to success green with white text; at 8.9s the "Correct ✅ /
Keep going!" overlay card slides up from the bottom of the phone. Hold to 10.0.
Left of the phone, big type: "Ranked." (5.0s, 110px) then "Server-checked answers." (5.6s, 64px)
then "The app never receives the answer key." (6.6s, 44px, muted, held 3.4s).
Behind the phone a soft radial glow in primary blue breathes with the music.
Sequential/interaction: yes. Timer ticks; simulated tap on an option; verdict overlay.
Audio intent: focus, a held breath, then release on the correct verdict.
Audio-coupled idea: click on the tap, bell on the green flip.
Music: bed continues.
Transition mood: dramatic (phone whips left with blur; VS cards enter) → Scene 3

### Scene 3 — 1v1 Live — 3.8s (10.0→13.8)
Full-frame recreation of `vs.tsx`, scaled up: two surface cards (#131A2E, 20px radius) slide in
from ±120px at 10.37s and settle; left card avatar1 "Amara" / "Lv 12 • #48", right card avatar3
"Tobi" / "Lv 9 • #131" (fictional). "VS" in primary blue pops between them at 10.93s and pulses
gently. Above: "1v1 Live." (10.4s, 96px) and "Real opponent. Same questions. Speed matters."
(10.9s, 40px muted, held 2.9s). Below the cards the countdown bumps in: "3" at 12.02, "2" at
12.55, "1" at 13.11 (beat-locked strong cue), each scaling 0→1 with a quick settle. Hold to 13.8.
Sequential/interaction: yes. Cards from opposite sides, VS pop, 3-2-1 countdown.
Audio intent: the moment before the match starts.
Audio-coupled idea: card slide on the cards, soft impact on VS, click on each countdown digit.
Music: bed continues.
Transition mood: hard-ish (0.25s scale crossfade) → Scene 4

### Scene 4 — Weekly leagues — 3.6s (13.8→17.4)
"Weekly leagues." slams in at 14.2s (100px). "Finish on top to move up a league." at 14.7s (40px
muted, held 2.7s). A row of seven chips pops in left to right at half-beat spacing from 14.73s:
🥉 Bronze, 🥈 Silver, 🥇 Gold, 💠 Platinum, 💎 Diamond, 🔮 Master, 👑 Legend, each filled with
its LEAGUE_STYLE colour with white text, the last landing at ~16.35s. Hold the full row to 17.4.
Sequential/interaction: yes, seven chips one by one, then the full set held for ~1s.
Audio intent: momentum, a ladder being climbed.
Audio-coupled idea: a soft drop on the first and last chip only.
Music: bed continues.
Transition mood: dramatic (the chips row dims and drops away as the prize line slams) → Scene 5

### Scene 5 — Prizes — 3.0s (17.4→20.4)
A soft #5B7CFF→#7C3AED gradient wash rises behind the frame (the onboarding prize slide). At
17.47s (beat-locked strong cue) the line slams in: "Top players are paid in USDT or USDC." (two
lines, 104px, "USDT or USDC" in mint #2EF2B3). At 18.56s the fine print settles beneath: "Skill
only. No purchase necessary. 18+." (36px, muted). Hold to 20.4.
Sequential/interaction: headline then fine print.
Audio intent: the payoff. One heavy hit, then let the music carry.
Audio-coupled idea: heavy soft impact on the slam, nothing on the fine print.
Music: bed continues.
Transition mood: dramatic (zoom-through) → Scene 6

### Scene 6 — Outro — 2.6s (20.4→23.0)
The app icon (rounded, 180px) scales in 0.6→1 with a soft blue glow at 20.75s; the "PulseQuiz"
wordmark (120px, 900) slides in beside it from the left at 20.9s; the tagline "Decided by skill
alone." fades up beneath at 21.84s (44px, muted) and holds to the end. Music fades 22.0→23.0.
The lockup stays on the last frame.
Sequential/interaction: icon, wordmark, tagline.
Audio intent: resolution.
Audio-coupled idea: bell on the icon landing.
Music: fades out under the lockup.
Transition mood: hold → end

**Music mood for this video:** cinematic
**Audio summary:** a steady bed from frame one, three weighted hits (the third rule, the correct
verdict, the prize line), quiet UI clicks where the demo shows a tap or a countdown, a bell on the
logo, and a one-second fade under the final lockup.
