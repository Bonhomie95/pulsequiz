# Brag Plan: PulseQuiz (v2)

## What is this app?
PulseQuiz is a store-ready Expo/React Native quiz game: 10-question sudden-death Ranked runs on a
server-enforced 15-second clock, live 1v1, weekly leagues from Bronze to Legend, and USDT/USDC prizes
for the top Ranked players, decided by skill alone.

## What changed from v1 (user direction)
Keep the three-rule hook and the phone demo. Make the phone the hero with a slow camera push-in that
lands on the tap and the green verdict. Hard cuts (one whip) so scene text never overlaps. One line of
copy beside the phone. Three real screens: Ranked play, 1v1 VS countdown, weekly leaderboard with
points. League tiers as a vertical ladder the player climbs. The prize line sits beside a real
leaderboard screen with its prize banner, not a gradient wash. Every scene keeps moving. End on the
icon and "Decided by skill alone." 20 seconds.

## The angle
A game trailer that shows the game being played on a phone, then shows what playing well gets you.
Every line is the app's own copy.

## Hook (first 2-3 seconds)
"Ten questions." / "Fifteen seconds each." / "One wrong answer ends the run." slam in on beats 0.30,
1.09 and 2.19 over the icon's pulse line, then a hard cut into the phone.

## Key moments (the middle)
- The Ranked play screen filling the frame while the camera pushes in on the answer cards; the timer
  ticks 11s → 5s (red), a fingertip taps "The Inca", it flips green, "Correct ✅ / Keep going!" rises.
- The VS screen at scale: two player cards slide in, "VS" pops, 3-2-1 counts down on the beat.
- A seven-rung league ladder fills the frame; the player's chip climbs from Bronze to Diamond.
- The weekly leaderboard screen (prize banner, tabs, ranked rows, "Amara (you)" counting to 920 pts)
  with "Top players are paid in USDT or USDC." beside it and the fine print beneath.

## Outro / punchline
Icon, "PulseQuiz", "Decided by skill alone." Music fades under the lockup.

## User flow worth showing
Play a Ranked question under the clock → answer → verdict → queue a 1v1 → climb the league → appear on
the paid leaderboard.

## Tone
- Preset: cinematic
- Creative direction: a mobile game trailer, phone as hero, camera always moving, hard cuts.
- Interpretation: fewer words, more screen; each scene has a continuous slow push or drift so no frame
  is still for more than a second; text lands on beats and holds to its reading floor.

## Format: landscape — 1920x1080
## Duration: 20 seconds

## Visual identity (from the project)
Same as v1: background #0B0F1A, surface #131A2E, border #1F2937, primary #5B7CFF (accessible
#3F57C9 for white-on-blue), mint #2EF2B3, violet #7C3AED, coin #FFC94A, success #0F7A3D for white text,
danger #FF7A85, muted #A6B0CF. Montserrat 900/700 for trailer type, Inter inside the phone screens.
LEAGUE_STYLE tier colours. Leaderboard names from the app's own LEADERBOARD_DATA constants (Alex,
Bella, Chris, Daniel) plus the fictional "Amara (you)". Bundled avatars.

## Privacy
No real users, wallets or emails. All names are app constants or fictional stand-ins.

## Share copy (draft)
PulseQuiz: ten questions, fifteen seconds each, one wrong answer ends the run. Climb the weekly league,
and the top Ranked players are paid in USDT or USDC. Skill only, no purchase necessary.

## Audio direction
- Role: cinematic support. Bed from frame one, weighted hits on the rules, the verdict, the ladder
  landing and the prize line, quiet clicks on the tap and countdown, a bell on the logo.
- Music: vol-12 (109.96 BPM) at 0.34, 0.3s in, fade 19.0→20.0.
- Music cue guidance: hook lines on 0.30 / 1.09 / 2.19; verdict beat-locked 8.74 (strong); cards 9.83,
  VS 10.37, countdown 10.93 / 11.46 / 12.02 (strong); ladder landing 14.20; leaderboard rows from 15.29;
  prize slam 16.38; logo 18.56 window (icon 18.3).
- Audio-reactive treatment: subtle; radial glow behind the phones, VS and logo breathes with bass.
- SFX posture: sparse, one per beat, low-HF-risk files.
- Restraint rule: nothing on sub-lines; bed never above 0.34.

## Storyboard

### Scene 1 — The rules — 3.8s (0.0→3.8)
Pulse line draws; three lines slam and stack (0.30 scale-slam, 1.09 side-snap, 2.19 rise-slam,
held 1.6s). The whole stack drifts in scale 1→1.04 so it never sits still. Hard cut.
Audio: three impacts, the third heavier.

### Scene 2 — The run (phone hero) — 5.6s (3.8→9.4)
Hard cut to a 440×952 phone near centre, one line beside it: "Ranked. Server-checked answers." The
scene inner pushes in slowly (scale 1→1.16, origin on the answer cards) for the full scene. Timer
11s → 5s (red at 7.9). Fingertip appears 8.3, presses 8.6 (click), "The Inca" flips green at 8.74
(beat-locked, bell), overlay rises 8.9, other options dim. Whip-cut out at 9.4.
Audio: click, bell, whip.

### Scene 3 — 1v1 Live — 3.2s (9.4→12.6)
Whip in. "1v1 Live." + "Real opponent. Same questions. Speed matters." Cards (340px) slide in from
both sides at 9.83, "VS" pops 10.37 and breathes, "3" 10.93, "2" 11.46, "1" 12.02 (beat-locked).
Slow push 1→1.06 throughout. Hard cut.
Audio: card slide, soft impact, three clicks.

### Scene 4 — Weekly leagues ladder — 2.4s (12.6→15.0)
Left: "Weekly leagues." + "Finish on top to move up a league." Right: a seven-rung vertical ladder
(Legend on top, Bronze at the bottom) fills the frame height; rungs pop bottom-up from 12.7 at 0.08s.
The player's chip (avatar + "Amara") starts on Bronze at 13.3 and climbs four rungs to Diamond by
14.5, each rung lighting as it passes; a soft impact on landing. Hard cut.

### Scene 5 — Leaderboard + prizes — 3.2s (15.0→18.2)
Right: phone with the weekly leaderboard screen: "Leaderboard", date range, prize banner
"WEEKLY PAYOUT / Prizes paid to top players every week" with a 3 DAYS 14 HRS countdown, tabs, five
ranked rows sliding in from 15.05 (Alex 1,200 · Bella 1,100 · Chris 980 · Amara (you) counting
0→920 · Daniel 880). Left: "Top players are paid in USDT or USDC." slams at 16.38, "Skill only.
No purchase necessary. 18+." at 16.93. Slow push throughout. Hard cut.
Audio: drop on the first row, heavy impact on the slam.

### Scene 6 — Outro — 1.8s (18.2→20.0)
Icon pops 18.3 (bell), wordmark snaps in 18.45, "Decided by skill alone." 18.85, held to the end.
Glow breathes with the bass; music fades 19.0→20.0.

**Music mood for this video:** cinematic
**Audio summary:** bed from frame one, four weighted hits, quiet clicks, a bell on the logo, a
one-second fade under the lockup.
