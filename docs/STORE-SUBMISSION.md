# App Store & Play Store submission checklist

Status of every requirement that can cause a rejection, and what is left for
you to do by hand.

## Fixed in code

| # | Requirement | Was | Now |
| --- | --- | --- | --- |
| 1 | **In-app account deletion** — App Store 5.1.1(v), Play policy | Endpoint existed, **no UI at all** | Settings → Danger Zone → Delete My Account, typed `DELETE` confirmation |
| 2 | **Privacy manifest** (`PrivacyInfo.xcprivacy`) | `NSPrivacyCollectedDataTypes` was an **empty array** | 10 data types declared (email, name, user ID, purchases, product interaction, crash, performance, device ID, advertising, coarse location) |
| 3 | **Tracking declaration** | `NSPrivacyTracking = false` while shipping AdMob | `true`, with `NSPrivacyTrackingDomains` |
| 4 | **App Tracking Transparency** | **Never requested.** A code comment wrongly claimed the ads SDK raised it | `expo-tracking-transparency`, prompted after the UMP form, before ads init |
| 5 | **Manifest survives prebuild** | Only in `ios/`, which `prebuild --clean` regenerates | Mirrored into `app.json` → `ios.privacyManifests` |
| 6 | **Subscription disclosure** — auto-renewable IAP | Auto-renew text only | Full billing terms + **Terms of Use and Privacy Policy links on the purchase screen** |
| 7 | **Legal reachable in-app** | Login screen only | Settings → Legal & Support (Terms, Privacy, Support) |
| 8 | **Encryption declaration** | Absent → asked on every upload | `ITSAppUsesNonExemptEncryption: false` |
| 9 | **Unused Android permissions** | `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `READ/WRITE_EXTERNAL_STORAGE` | Blocked via `android.blockedPermissions` |
| 10 | **Stale microphone string** | `NSMicrophoneUsageDescription` left over from `expo-av` | Removed |

Covered by `server/src/__tests__/accountDeletion.test.ts`.

## You must do these — they cannot be done in code

### 1. Real-money gaming approval — the biggest risk

The app pays **real USDT prizes**. Both stores treat that as regulated:

- **Apple 5.3 / 5.3.4** — real-money gaming apps must be submitted by the
  licensed entity (not an individual developer account), be geo-restricted to
  jurisdictions where you hold a licence, and be rated 18+.
- **Google Play real-money games policy** — allowed only in listed countries,
  requires a separate RMG application and operator licence.

If reviewers read prize payouts as gambling, no amount of code fixes it.
**Get legal advice on how your prize model is classified before submitting.**
A skill-based contest with no paid entry is usually treated differently from
one where purchased coins affect winnings — the fact that coins are sold via
IAP *and* prizes are paid in USDT is the combination that draws scrutiny.

### 2. Host the legal pages

`src/constants/links.ts` points at `pulsequiz.app/terms`, `/privacy`,
`/support`. **These must resolve to real pages** — reviewers open them. The
privacy policy must disclose everything the manifest now declares, name
Google AdMob and Sentry as third parties, and state the retention period.

### 3. Account deletion web URL (Google Play)

Play requires an **externally reachable** deletion page in addition to the
in-app flow — a URL a user can reach without installing the app. Declare it in
Play Console → App content → Data deletion.

### 4. Store console forms

- **Apple**: Privacy Nutrition Labels in App Store Connect must match the
  manifest above, or the mismatch is itself a rejection.
- **Google**: Data safety form, likewise. Declare the Advertising ID.
- **Age rating**: 18+ given real-money prizes.
- **Demo account** for reviewers, since sign-in is OAuth-only.

### 5. AdMob console

The consent flow currently fails at runtime:
`Failed to read publisher's account configuration`. Publish a privacy message
under **Privacy & messaging → GDPR / US states**. Also confirm the
`androidAppId` and `iosAppId` in `app.json` — they sit under *different*
publisher IDs, which is unusual for one account.

### 6. SKAdNetwork identifiers (recommended, not blocking)

`SKAdNetworkItems` is absent from `Info.plist`. This does not cause rejection,
but without it AdMob attribution is degraded. Google publishes the current list.

## Rebuild required

Items 2–5, 9 and 10 are native config:

```bash
cd mobile && npx expo prebuild --clean && npx pod-install
```

Then verify in the built app: the ATT prompt appears once on first launch,
Settings shows Delete My Account, and the premium screen shows both legal links.
