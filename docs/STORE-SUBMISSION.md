# App Store & Play Store submission checklist

Everything that can cause a rejection, what the code now does about it, and
the steps that can only be done by you in a console.

## Fixed in code

### Store policy

| Requirement | Now |
| --- | --- |
| **Contests / prizes — Apple 5.3.2** (official rules in-app, store not a sponsor) | Rules & prizes sheet (Home, Leaderboard, Wallet) has a *Sponsor* section naming Apple/Google as not involved, eligibility (18+, void where prohibited), no-purchase-necessary; full rules hosted at `/rules` and linked from Settings |
| **IAP must not buy real-money outcomes — Apple 5.3.3 / Play real-money policy** | Answers helped by a coin-bought hint or extra time earn **0 leaderboard points** and void the perfect bonus (server-enforced, tested). Coins cannot be exchanged for USDT/USDC, stated on the Buy screen, rules and Terms |
| **Crypto for tasks — Apple 3.1.5(iii)** | Ads, referrals and streaks pay coins only; crypto only for leaderboard rank |
| **Account deletion — Apple 5.1.1(v), Play** | In-app (Settings → Danger Zone) + web page `/delete-account` |
| **Subscription disclosure — Apple 3.1.2** | Store price + period (`$24.99 / year`) is the most prominent price; no hardcoded USD; auto-renew terms; Terms/Privacy links; Subscribe disabled until the store returns a price |
| **Restore purchases** | Premium: restores from the store (both platforms) with busy state. Coins (consumable): replaced the misleading "Restore" with "Paid but didn't receive coins? Tap to complete" |
| **Unfinished transactions / Play 3-day auto-refund** | `reconcilePendingPurchases()` runs after every sign-in and launch; credits and finishes/acknowledges anything paid but not verified |
| **Sign in with Apple — 4.8 / HIG** | Apple's own `AppleAuthenticationButton`, same size as others, listed first |
| **Placeholder assets — 2.3.8** | Real icon, Android adaptive icon (foreground/background/monochrome), splash and favicon; Expo template images deleted |
| **Broken features — 2.1** | PvP/rooms/rematch socket namespace bug fixed (every PvP connection was refused); Streak screen "Check in" now checks in; Home "Challenge" opens a real room invite |
| **Ads — AdMob policy / paid feature** | Premium users never see interstitials; the 10-minute interstitial timer (could interrupt live PvP) removed — interstitials only at result screens; per-platform unit ids; "watch ad" hidden where no unit is configured |
| **Legal pages reachable** | Server hosts `/terms`, `/privacy`, `/rules`, `/support`, `/delete-account`; app links default to the API origin (override with `EXPO_PUBLIC_WEB_URL`) |
| **Permission strings** | Face ID string removed (unused); microphone string reworded honestly (the audio SDK links recording APIs; the app never requests it); Android mic/storage/overlay permissions stripped |
| **Privacy manifest** | Adds Other Financial Info (wallet address) and Gameplay Content; 50 SKAdNetwork ids |
| **iPad** | `supportsTablet: false` — the phone-only layout runs in iPhone mode, so no iPad screenshots are required |
| **Missing native peer dep** | `expo-asset` installed (expo-doctor: 18/18 pass) |
| **EAS build config** | Google/Facebook/AdMob public ids in `eas.json` (the gitignored `.env` never reaches EAS, so sign-in was broken in store builds); Android builds an `.aab` |

### Product upgrades (September 22)

| Feature | What it does |
| --- | --- |
| **Try before sign-in** | Login → "Try a quick quiz first": 5 easy questions, no account (`GET /api/quiz/guest`). Helps Apple 5.1.1 (don't force sign-in before showing value) |
| **Practice mode** | All 10 questions, wrong answers don't end the run, explanation after each answer. League XP only |
| **Daily Quiz** | Same 10 questions for everyone per local date, one attempt, no hints, share grid (🟩🟥), daily top 10 |
| **Weekly leagues** | Groups of ~30 by tier (Bronze → Legend). Top 20% promoted, bottom 20% relegated, podium gets coins. Settled hourly after Monday 00:00 UTC |
| **Challenge a friend** | Async duel: 10 fixed questions, 6-char code, share link `https://<host>/d/CODE`, push when the friend finishes |
| **Explanations** | Optional `explanation` per question (admin editor, CSV/JSON import column) |
| **Prize regions** | Admin → Settings → Payouts: *Cash Prizes Enabled* and *Prize Countries*. Outside the list, all prize UI is hidden and payouts are refused (`region_not_eligible`) |
| **Fewer ads** | No interstitial in a new player's first 5 runs, then at most one every 4 runs |
| **Simpler home** | Daily + League cards up top; the Earn row moved to Wallet |
| **Report de-dupe** | One report per player per question counts toward auto-disable |

Only **Ranked** runs and 1v1 earn prize-leaderboard points. Practice, Daily and
duels can't, because a shared answer key would make them cheatable.

### Security (server)

- Parallel IAP verify for one transaction credited coins N times → atomic claim.
- One store subscription could make any number of accounts premium → rejected.
- Streak check-in farmable ~24×/day by hopping timezones → zone pinned per user.
- Parallel home loads seeded duplicate challenge sets → unique slot index.
- Payout retry could send the same prize twice (double click, overlapping cron, or after the amount rolled into a later payout) → claim + balance reservation, `superseded` status.
- A finished PvP player lost the pot by disconnecting; any user could join another match's socket room; two guests could double-stake a room host; a host leaving the room screen left it joinable → all fixed.
- Apple `CONSUMPTION_REQUEST` wrongly clawed back coins; `REFUND_REVERSED` now restores them; duplicate refund notifications no longer double-deduct.
- Deleted-and-recreated accounts farmed referral bonuses → identity hash on tombstones.
- Banned/logged-out users kept live sockets → disconnected immediately.
- Admin login per-account lockout; admin tournament mass-assignment; unbounded list limits; unaudited moderator actions.

## You must do these — they cannot be done in code

1. **Deploy the server** (see RUNBOOK) and make sure `https://<api-host>/terms` etc. load. If you run a marketing site at `pulsequiz.app`, serve or proxy the same five paths and set `EXPO_PUBLIC_WEB_URL`.
2. **Replace `support@pulsequiz.app`** in `server/public/legal/*.html` with a mailbox you read, and have the Terms/Privacy/Rules reviewed by a lawyer for the countries you launch in. Real-money prizes are regulated differently per country; restrict availability in App Store Connect / Play Console to countries where your lawyer says the contest is lawful.
3. **AdMob:** create **iOS** ad units under the same publisher as the iOS app id (`ca-app-pub-7561090708148190~…`) and add them to `eas.json` as `EXPO_PUBLIC_ADMOB_*_ID_IOS`. The current units belong to the Android publisher and are scoped to Android. Publish a GDPR/US-states consent message (Privacy & messaging). Set the rewarded SSV callback and `ADMOB_REWARDED_AD_UNIT_IDS` on the server.
4. **App Store Connect**
   - Age rating: answer *Contests: Yes*, *Simulated Gambling: Infrequent/Mild* (coin wagers) → 17+.
   - Privacy "nutrition label" must match the manifest: Contact Info (email, name), Identifiers (user ID, device ID), Purchases, Financial Info (other — wallet address), Gameplay Content, Usage Data (product interaction, advertising data), Diagnostics (crash, performance), Location (coarse, via AdMob). Tracking: Yes (AdMob).
   - Create the 4 subscriptions in one group and the 5 consumable coin packs with the SKUs in `server/src/iap/products.ts`.
   - App Store Server Notifications V2 URL: `https://<api-host>/api/webhooks/apple`.
   - **Review notes:** explain the prize model in two lines ("free-to-enter skill leaderboard; purchases cannot affect ranking — see Rules in the app"), and provide a **demo account**. Sign-in is OAuth-only, so create a dedicated Google account for review and put its credentials in the review notes.
5. **Play Console**
   - Data safety form = the same data as above; declare Advertising ID use.
   - App content → Data deletion → `https://<host>/delete-account`.
   - Content rating questionnaire: contests with real prizes; simulated gambling (virtual coin wagers).
   - Target audience 18+ (prizes) — keeps the app out of Families policy.
   - Real-time developer notifications → `https://<api-host>/api/webhooks/google` (OIDC: set `PUBSUB_VERIFICATION_AUDIENCE` **and** `PUBSUB_SERVICE_ACCOUNT_EMAIL`; production now refuses without the email).
   - Upload the first `.aab` manually once (EAS submit needs an existing app), then `eas submit -p android`.
6. **Prize countries:** in Admin → Settings → Payouts, set *Prize Countries* to the list your lawyer approves (blank = everywhere). The app reads the country from Cloudflare's `CF-IPCountry` header if the API is behind Cloudflare, otherwise from the device region.
7. **Explanations:** existing questions have none yet. Add them in the admin editor or re-import with an `explanation` column. Practice mode and the Daily Quiz work without them, but they are the main learning feature.
8. **Share links:** set `APP_STORE_URL` (once the app has a store listing) and optionally `PLAY_STORE_URL` on the server for the `/d/CODE` challenge page.
9. **Screenshots:** 6.9" and 6.5" iPhone; Play phone screenshots + 1024×500 feature graphic. The new icon is at `mobile/assets/images/icon.png`.

## Build

```bash
cd mobile
eas build -p ios --profile production
eas build -p android --profile production
```

Verify on a device before submitting: ATT prompt once after the consent form;
Settings shows the USDT/USDC wallet and Delete My Account; Premium shows store
prices and Restore; a PvP match connects.
