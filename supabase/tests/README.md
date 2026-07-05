# Kalo engine test suite

SQL-assertion tests for the trading engine (KALO_DEV_PROMPT.md §4/§7).
Plain `DO`-block assertions (no pgTAP dependency): a failing check raises,
which fails the psql run / CI step.

## Files

| file | covers |
|---|---|
| `helpers.sql` | test users (real `auth.users` rows), impersonation, market factory, `expect_error`, `check` |
| `invariants.sql` | `assert_invariants()` on live state + I4 full-lifecycle scenario (grant → mint cross → cancel → close/flush → resolve → redeem → exact conservation) |
| `matching_best_execution.sql` | P0-1 cross-path best execution (BUY and SELL sides), cross-path time tie-break, P0-4 self-trade skip — all fail on the v2 engine |
| `validation.sql` | P0-2 tick/min rejections (incl. 0.01/0.99 boundary acceptance), P0-3 close_at rejection + `close_due_markets()` flush/refund |
| `fuzz.sql` | seeded 400-op random stream (places/cancels/splits/IOC) with `assert_invariants()` every 100 ops |
| `order_types.sql` | M2: P0-7 idempotent submission (same `client_order_id` → same order, single escrow), FOK all-or-cancel (reject leaves balance untouched), GTD validation/matching-exclusion/cron reclamation, P0-8 fee hooks at zero (fee_amount = 0, treasury flat), auto-redemption at resolution |
| `resolution_conservation.sql` | I7 (0013): OI frozen pre-payout at resolution, parity redeem records against it, loser redeem is a no-op — **plus the negative tests proving I7 fires** on payout-ledger corruption and post-resolution share resurrection, and that I1 fires on a raw double-credit |
| `news_curation.sql` | news engine + curation (0014/0015): ingest → impact → market-state shock → proposal, non-admin approval rejected, §8.7 checklist-failing proposal rejected, approval creates the market, resolution suggestion → accept resolves with I7 snapshot, persona burst + all invariants green |
| `world_cup.sql` | World Cup game engine (0018): fixture mints the six-market set (kinds, criteria, close_at = kickoff+2h, bot priors), non-admin/past-kickoff/bad-prior rejections, trade → `resolve_game(3,1)` settles every kind correctly with auto-redemption, 0-0 complement verdict set, double-resolution rejected, invariants green after the full lifecycle |
| `concurrency_resolve_race.sh` | deterministic resolve/place race: session A holds the advisory lock inside the resolve gap while session B fires an order; PASS = B serialized + rejected + zero residue + I1/I7 green. `LOCK=off` control run demonstrates the lock is load-bearing. Needs a direct `DATABASE_URL` to a disposable stack |
| `concurrency.sql` | parallel sessions via dblink (skips with a notice when dblink is unavailable); supplemented by continuous HFT-bot load + the 10-minute `record_invariants()` cron |

## Running

Against a disposable local stack (CI):

```sh
supabase db reset
for f in helpers invariants matching_best_execution validation order_types fuzz; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -c 'begin;' -f supabase/tests/helpers.sql -f "supabase/tests/$f.sql" -c 'rollback;'
done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/concurrency.sql  # commits; disposable DB only
```

Against staging: wrap each file in `begin; … rollback;` exactly as above —
every test creates its own users/markets and rolls everything back. Only
`concurrency.sql` commits (dblink sessions are independent transactions) and
must not be pointed at production data.

The live invariants also run on a schedule: `record_invariants()` via pg_cron
every 10 minutes into `invariant_runs`. A red row is a release blocker.
