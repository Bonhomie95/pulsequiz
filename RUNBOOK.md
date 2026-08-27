# PulseQuiz operations runbook

Everything an operator needs to deploy this safely and respond when it breaks.

---

## 1. Deploying the hardened server

The order matters. Several new indexes are **unique** and enforce correctness
(idempotent quiz finishes, one ad reward per Google transaction, one account per
provider identity), so they must exist before the new code runs.

```bash
cd server
npm ci
npm run build
```

**Step 1 — check for data that will block the index build.**

```bash
npm run sync-indexes -- --report
```

This reports duplicate `(userId, sessionId)` quiz sessions, duplicate
`(provider, providerId)` users, and usernames that collide case-insensitively.
It changes nothing. Fix anything it names before continuing — a unique index
cannot build over existing duplicates, and that is the point.

**Step 2 — build the indexes.** On a large collection this takes minutes; run it
in a maintenance window.

```bash
npm run sync-indexes
```

**Step 3 — set the new required environment variables.** The server refuses to
start in production without them (see `.env.example` for the full list):

| Variable | Why it is required |
|---|---|
| `FRONTEND_ORIGIN` | An explicit origin list. `*` reflects any origin with credentials. |
| `SENTRY_DSN` | Otherwise server errors go nowhere. |
| `ADMOB_SSV_ENABLED=1` | Without it, rewarded-ad coins are minted on the client's word. |
| `JWT_SECRET`, `ADMIN_JWT_SECRET` | Must be ≥32 chars, different from each other, not the placeholder. |
| `APPLE_ROOT_CA_G3` | Anchors the App Store webhook signature chain. |
| `NOWPAYMENTS_EMAIL` / `_PASSWORD` | The payout API needs a bearer token, not just the API key. |

**Step 4 — deploy, then verify.**

```bash
curl -fsS https://<host>/health          # 200 with mongo: "connected"
curl -fsS https://<host>/metrics -H "Authorization: Bearer $METRICS_TOKEN"
```

**Step 5 — seed the expanded question set.**

```bash
npm run seed
```

---

## 2. External services to configure

These are the ones where the code is now ready but the provider side is not.

### AdMob server-side verification — required
Console → the rewarded ad unit → **Server-side verification** → set the callback to:

```
https://<host>/api/webhooks/admob/ssv
```

Until this is set and `ADMOB_SSV_ENABLED=1`, ad rewards do not credit at all in
production (by design — the alternative is an open currency faucet).

### App Store Server Notifications V2
App Store Connect → App Information → **App Store Server Notifications** →
production URL:

```
https://<host>/api/webhooks/apple
```

Without it, a user can buy coins, spend them, refund the purchase, and keep them.

### Google Play Real-Time Developer Notifications
Play Console → Monetisation setup → **Real-time developer notifications** →
Pub/Sub topic, with a push subscription pointing at:

```
https://<host>/api/webhooks/google?token=$GOOGLE_RTDN_SECRET
```

Prefer OIDC: set `PUBSUB_VERIFICATION_AUDIENCE` and
`PUBSUB_SERVICE_ACCOUNT_EMAIL` instead of the shared secret.

### NOWPayments
Payouts need `NOWPAYMENTS_EMAIL` + `NOWPAYMENTS_PASSWORD` (for the bearer token)
and, if the account has 2FA, `NOWPAYMENTS_2FA_CODE`. **Run one real payout of a
trivial amount end to end before any period closes.**

---

## 2b. Retiring the old ten-year tokens

Sessions created before this release were signed with a ten-year expiry and no
version claim, so bumping `tokenVersion` cannot revoke them. They are still
accepted — signing everyone out on upgrade would be worse — and
`GET /api/auth/me` swaps each one for a modern 30-day pair the first time the
app opens. The mobile client stores the replacement automatically.

Once the fleet has rolled over (watch for `Upgraded a legacy session token` in
the logs going quiet, typically two to four weeks), close the door:

```bash
REJECT_LEGACY_TOKENS=1
```

Anyone still holding an old token is then asked to sign in again — by that
point a small tail of dormant installs.

---

## 2c. Known dependency debt: the Expo SDK

`npm audit` is clean for the server and admin. Mobile reports 9 high-severity
findings, and every one of them lives in the Expo build toolchain —
`@expo/cli`, `metro`, `metro-config`, `metro-transform-worker`, `image-size`,
`postcss`. None of these ship inside the app bundle; the exposure is a
developer machine or a CI runner, not a user's phone.

They all resolve to the same fix: **Expo SDK 54 → 57**, a major upgrade that
changes the React Native version and touches every `expo-*` package. That is a
planned migration with device testing, not an audit fix — running
`npm audit fix --force` would silently attempt it and leave the app unbuildable.

What has been done instead:
- `axios` upgraded to 1.19.x in all three projects (the one high-severity
  finding that reached production code).
- `brace-expansion` and `ws` pinned via `overrides` in `mobile/package.json`.
- `@sentry/node` upgraded to v10 on the server, which cleared the entire
  OpenTelemetry advisory tree.

Schedule the SDK upgrade; until then the remaining findings are build-time only.

---

## 3. Scheduled jobs

Every job takes a distributed lock, so running several replicas is safe. On a
dedicated worker set `RUN_CRON=1` and on web nodes `RUN_CRON=0`.

| Job | Schedule (UTC) | What it does |
|---|---|---|
| `leaderboard-refresh` | every minute | Rebuilds the three snapshots. Replaces the per-request rebuild. |
| `weekly-payout` | Mon 00:05 | Settles **the week that just ended**. |
| `monthly-payout` | 1st 00:10 | Settles **the month that just ended**. |
| `payout-retry` | every 6h | Retries failures; reconciles with the provider first. |
| `ledger-reconciliation` | 03:30 daily | Wallet balances vs. the transaction log. |
| `pvp-sweeper` | every 2 min | Settles matches stranded by a restart. |
| `streak-warnings` | hourly at :15 | Nudges players whose streak is about to lapse. |
| `tournament-status` | every 5 min | Activates, closes and **pays out** tournaments. |
| `expire-quiz-sessions` | every 10 min | Closes sessions past their deadline. |

---

## 4. When something goes wrong

### "A payout didn't arrive"
1. Admin → Payouts, filter by `failed`. `failReason` says why.
2. `retries: 99` means the outcome was **indeterminate** — the provider may or
   may not have sent it. Do **not** retry. Check the provider dashboard for the
   reference `{period}:{periodLabel}:{userId}` first.
3. `skipped` with a reason means the user was ineligible; the same reason is
   shown to them on their wallet screen.

### "Coins went missing / a balance looks wrong"
1. Admin → Users → the account. The detail view shows `ledger.drift` — wallet
   balance minus the sum of the transaction log. It should be `0`.
2. Non-zero drift means something wrote the wallet without a ledger entry.
   Check the nightly `ledger-reconciliation` log for the pattern.
3. Correct it with **Adjust coin balance** (a signed delta with a reason), never
   by editing the balance directly — the adjustment writes both a ledger entry
   and an audit record.

### "A match hung and the coins are locked"
The `pvp-sweeper` settles anything untouched for 10 minutes. To check:

```js
db.pvpmatches.find({ settledAt: null, state: { $in: ['MATCHED','ACTIVE','WAITING_ON_OPPONENT'] } })
```

Nothing should sit here for more than ~12 minutes.

### "The server is restarting repeatedly"
`unhandledRejection` / `uncaughtException` now report to Sentry and exit
deliberately. Search the logs for `Fatal:` — the stack names the cause.

### "Players report a wrong answer"
Admin → Questions → filter **flagged**. A question reported by 5+ players is
pulled from rotation automatically. Editing the question clears the count.

---

## 5. Rolling back

The schema changes are additive — new fields and indexes only — so the previous
server build runs against the new data. Two caveats:

- Sessions issued by the new build carry a `tv` claim the old build ignores;
  users stay signed in.
- Ad rewards stop crediting on rollback unless you also unset
  `ADMOB_SSV_ENABLED`, because the old code has no SSV endpoint.

Do **not** drop the new unique indexes on rollback; they are harmless to the old
code and expensive to rebuild.

---

## 6. Before the first real payout period

- [ ] One real NOWPayments payout completed end to end
- [ ] AdMob SSV verified with a real device (watch an ad, confirm coins arrive)
- [ ] Apple and Google webhooks each fire once in sandbox (refund a test purchase)
- [ ] `npm run sync-indexes -- --report` is clean
- [ ] A prize pool exists for the period label the cron will look up
      (`GET /api/admin/payouts/period-options` shows both current and previous)
- [ ] MongoDB backup **restored** into a scratch database, not just taken
- [ ] Legal sign-off on the prize/wager model for every launch market
- [ ] `db.cointransactions` sums match `db.coinwallets` balances (the nightly
      `ledger-reconciliation` job reports this; it should say zero drift)
