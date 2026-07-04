# KALO — Development Prompt (Phase 1: Play-Money Exchange)

> Standing instruction set for any agent or engineer working on Kalo during Phase 1.
> Referenced from AGENTS.md / CLAUDE.md.

## 1. Mission and phase scope

You are building Kalo, an event-contract exchange (prediction market) architecturally mirroring Polymarket's engine: a central limit order book over binary YES/NO contracts, where every YES+NO pair is backed by exactly 1 unit of collateral, and settlement uses the three canonical paths — transfer (same-outcome buy vs sell), mint (YES buyer + NO buyer, prices summing ≥ 1), and merge (YES seller + NO seller, prices summing ≤ 1).

Phase 1 uses play money only. The objective of this phase is a provably correct trading engine and a complete exchange experience, validated by real users trading valueless balances. Real money, payments, KYC, and any blockchain settlement are explicitly out of scope (§10). However, every design decision must preserve the upgrade path: the play-money ledger implements exact CTF semantics (split/merge/redeem, full collateralization) so that Phase 2+ can swap the Postgres settlement layer for on-chain settlement without changing engine semantics.

Definition of Phase 1 success: the invariant suite (§4) passes continuously under concurrent load and fuzzed order flow; 50+ real users have traded through a full market lifecycle (list → trade → close → resolve → redeem) with zero balance discrepancies; and the engine's behavior matches the reference semantics in §6 exactly.

## 2. Current state of the codebase (audited 2026-07-04, branch claude/polymarket-ui-design-dlfmzd)

Do not rebuild what exists. The stack is Next.js 16 (App Router, RSC, server actions) + Supabase (Postgres, Auth, Realtime) + Tailwind 4 + shadcn/radix. Heed AGENTS.md: this Next.js version has breaking changes — read node_modules/next/dist/docs/ before writing framework code.

Already implemented and working:

- `supabase/migrations/0001_kalo_core.sql` — schema (profiles with balance, markets, positions, orders, trades), handle_new_user, split_shares, merge_shares, place_order (v1), cancel_order, create_market (admin), resolve_market (admin; cancels+refunds all resting orders), redeem_market, get_order_book (aggregated levels, anonymized).
- `0002_kalo_matching_v2.sql` — place_order v2: escrow-on-placement (cash for buys, shares for sells), matching loop with transfer → mint → merge paths, maker-price fills with taker price-improvement refunds, IOC remainder cancellation, trade kind tagging.
- `0003_kalo_bots.sql` — bot trader provisioning, per-market random-walk target, bot_tick() on pg_cron, bot_backfill (⚠ inserts uncollateralized cosmetic trades directly into trades).
- `0004_kalo_hft_command.sql` — burst-mode bot engine with momentum/heat/news-shock state, trending-weighted market selection, admin Command Centre RPCs (bot_status, bot_command, bot_config).
- `0005_kalo_realtime.sql` — realtime publication.
- App: home with category tabs/hot rail, market detail (market-workspace, order book, big chart, chance gauge, split/merge panel, redeem panel), portfolio with order cancellation, auth (signup/login/confirm), admin page (create market, resolve buttons, command centre), currency provider/picker, server actions in app/actions/* as thin RPC wrappers.

Engine defects found in audit — these are the P0 backlog (§5).

## 3. Prime directives

1. **Correctness over features.** No new surface area ships while a P0 engine defect is open or an invariant test fails.
2. **The database is the engine.** All money/share mutations happen inside Postgres functions in a single transaction. Never mutate balances, positions, or orders from application code. Server actions remain thin RPC wrappers.
3. **Migrations are append-only.** Never edit an applied migration; ship 000N_*.sql forward migrations. Every function change is create or replace in a new migration with a header comment explaining what changed and why.
4. **Security definer discipline.** Every RPC: security definer, set search_path = public, derives the actor from auth.uid(), validates all inputs before any mutation, and is covered by explicit grant execute. RLS stays enabled on every table; users read/write only via RPCs or scoped policies.
5. **Play money must stay valueless.** No purchase of balance, no cash-out, no prizes convertible to value, no peer-to-peer balance transfers. The moment play money becomes convertible, Kalo is likely a gaming product under Nigerian law without a licence. This is a hard product boundary, not a styling choice.
6. **Preserve the upgrade path.** Any semantics that would differ on-chain (e.g., netting shortcuts that skip mint/burn accounting) are forbidden. Open interest, pair supply, and collateral lockup must be explicitly representable at all times.

## 4. Invariants — the conservation laws (permanent, non-negotiable)

Implement these as a pgTAP (or SQL-assertion) suite `supabase/tests/invariants.sql`, runnable on demand and scheduled via pg_cron against staging. A red invariant is a release blocker.

**I1 — Cash conservation.** sum(profiles.balance) + sum(open BUY escrow) + sum(open interest across markets × 1) = total play money ever minted (faucet grants + signup grants), for all time. Open BUY escrow = Σ over open/partial BUY orders of price × (size − filled_size). Open interest per market = outstanding YES/NO pair count (see I2).

**I2 — Pair symmetry.** Per market: Σ YES shares (positions + shares escrowed in open SELL YES orders) = Σ NO shares (same definition) = open interest. Mint/split increase it; merge/redeem decrease it; transfers never change it.

**I3 — No negative anything.** Balances, position shares, order remaining sizes: always ≥ 0, enforced by CHECK constraints and asserted by tests (constraints catch bugs; tests catch constraint gaps).

**I4 — Escrow completeness.** Every open/partial order's escrow is fully accounted: cancelling all orders and resolving all markets must return the system to sum(balances) = total minted exactly (redeemed winners included).

**I5 — Best execution (see §6.2).** No fill may execute at a worse effective price than the best available across both settlement paths at match time. Assert via fuzz tests, not just review.

**I6 — Trade-table integrity.** Every row in trades corresponds to a real collateralized settlement. Seed/cosmetic data must live in a separate table or carry an is_seed flag excluded from volume ranking, charts (optionally), and all invariant sums. (Currently violated by bot_backfill — P0.)

## 5. P0 defect backlog (fix in this order, one migration + tests each)

**P0-1: Unified-book best execution.** place_order currently tries transfer, then mint, then merge — settlement kind has priority over price. Rewrite matching to compute, per iteration, the best effective counterparty across paths and take it, tie-breaking by created_at:

- For an incoming BUY on outcome O at limit p: candidates are (a) best SELL O with price ≤ p → effective cost = that price; (b) best BUY on the complement with price q where p + q ≥ 1 → effective cost = 1 − q. Take min effective cost; on tie, earlier created_at wins across both candidate sets.
- For an incoming SELL on O at limit p: candidates are (a) best BUY O with price ≥ p → proceeds = that price; (b) best SELL complement with price q where p + q ≤ 1 → proceeds = 1 − q. Take max proceeds; time tie-break.
- Maker always fills at their own limit; taker keeps the improvement. Add fuzz tests that construct cross-path books and assert I5.

**P0-2: Tick size and minimum size.** Enforce price on a 0.01 grid (reject otherwise; do not silently round) and a minimum order size (e.g., 1.00) with a max of 2 decimal places on size. Backfill-safe: constraint applies to new orders. Publish tick/min via a market_config or per-market columns so the client reads, never hardcodes.

**P0-3: close_at enforcement.** place_order must reject orders where now() >= close_at even if status is still open. Add a pg_cron job transitioning markets open → closed at close_at (cancel+refund resting orders exactly as resolve_market does), leaving resolution as a separate admin/oracle step. Add a closed status to the model and UI.

**P0-4: Self-trade prevention.** Reject or skip matches where maker and taker share user_id (skip-and-continue is the standard venue behavior; wash prints must never hit trades). Note the interaction with the volume-ranked Hot rail: without this, wash trading is incentivized.

**P0-5: Seed-data quarantine.** Move bot_backfill output out of trades (separate seed_trades table or is_seed flag). Exclude from volume ranking and invariant sums. Migrate existing seed rows.

**P0-6: Concurrency hardening.** Take pg_advisory_xact_lock(hashtext(market_id::text)) at the top of place_order, cancel_order, resolve_market, and the market-close job to serialize per-market mutation and eliminate the resolve/place race (an in-flight order resting after resolve's cancel loop strands escrow). Keep for update skip locked inside as a second layer. Add a concurrency test: N parallel sessions hammering one market; invariants hold after.

**P0-7: Idempotent order submission.** Add client_order_id uuid with a unique constraint per user; the server action generates it per form submission so retries/double-clicks cannot double-place.

**P0-8: Fee hooks at zero.** Add fee_bps (market-level, default 0) and record fee_amount per trade (charged to taker, credited to a treasury profile). Rate stays 0 in Phase 1 — the point is that the accounting, invariants (I1 gains a treasury term), and UI exist before real money ever does.

## 6. Engine semantics reference (the contract any implementation must satisfy)

**6.1 Order model.** Binary markets, prices in (0,1) on the tick grid, sizes ≥ min. Sides BUY/SELL per outcome. Escrow at placement: BUY locks price × size cash; SELL locks size shares of that outcome. Cancel/expire refunds remaining escrow exactly.

**6.2 Matching.** Price-time priority on a unified book: complement orders are equivalent to same-book orders at (1 − price). Best effective price wins regardless of settlement kind (P0-1). Maker fills at maker's limit; taker refunded improvement. Settlement kinds recorded per trade: transfer_yes, transfer_no, mint, merge.

**6.3 Order types.** Phase 1 target set: GTC (default), IOC/FAK (exists), GTD (add: expires_at, enforced by the same cron that closes markets), FOK (add: pre-compute fillable quantity across the unified book inside the transaction; execute all-or-cancel). Match Polymarket's four-type surface (GTC/GTD/FOK/FAK) so client and future API semantics carry over.

**6.4 Lifecycle.** open → closed (close_at) → resolved (admin verdict) → redemption. Resolution cancels nothing (orders were already flushed at close), sets resolved_outcome, and opens redeem_market (winners burn shares 1:1 for balance; losing side zeroed). Add auto-redemption at resolution as a UX improvement (iterate positions inside resolve_market) — but keep redeem_market for parity with on-chain semantics.

**6.5 Bots.** Bots trade only through place_order/cancel_order (already true for the tick/burst engines — keep it that way). Bot cash must be minted through the same accounting as user grants so I1 holds. Bots are subject to self-trade prevention and tick rules like everyone else.

## 7. Testing requirements

- Framework: pgTAP under supabase/tests/, run via `supabase test db` in CI on every migration change.
- Unit: every RPC — happy path, each rejection branch, boundary prices (tick edges, 0.01/0.99), partial fills, IOC/FOK/GTD behavior.
- Property/fuzz: a SQL or TS harness generating random order streams (mixed sides/outcomes/prices/sizes/cancels) against seeded users; after every N operations, assert I1–I6. This suite is the project's crown jewels; treat failures as engine bugs, never test flakes.
- Concurrency: parallel-session tests per P0-6.
- Regression: every P0 fix lands with a test that fails on the old behavior (e.g., the P0-1 cross-path scenario in §5).

## 8. Product scope for Phase 1 (build after P0s are green)

1. Play-money economy: signup grant (exists via handle_new_user) + daily faucet claim (streak-friendly, capped) + explicit "this is play money, no cash value" copy at grant points. No transfers between users.
2. Leaderboard: ranked by realized + mark-to-mid PnL (not balance — balance rewards inactivity), weekly and all-time. This is the retention engine of a play-money product; without competition the exchange is a screensaver.
3. Portfolio PnL: per-market cost basis, realized/unrealized split, redemption history.
4. Price history: persist per-market OHLC/mid snapshots (cron) so charts don't recompute from raw trades; exclude seed data or backfill it into the history table only.
5. Market detail polish: unified-book depth display (YES terms), tape with settlement-kind labels, position/open-order panel — most exists; align with engine changes.
6. Fill notifications via Supabase Realtime on the user's orders/trades.
7. Admin: market curation checklist enforced in the create form (unambiguous resolution criteria, named public source, cutoff — reject listings failing it), close/resolve tooling, bot command centre (exists).

## 9. Conventions

- TypeScript strict; server actions validate and delegate to RPCs; no client-side money math beyond display.
- Follow AGENTS.md Next.js 16 guidance; consult bundled docs before framework work.
- shadcn/radix components; keep the existing design language; no new UI libraries.
- Every migration: header comment (what/why), forward-only, grant execute explicit.
- Never expose per-user order ownership in public reads (get_order_book pattern is correct — keep it).

## 10. Explicitly out of scope for Phase 1

No blockchain, wallets, or tokens. No payments, deposits, withdrawals, or anything of monetary value. No KYC. No fees > 0. No multi-outcome (negRisk) markets. No public trading API keys (internal RPCs only). No sports-style delay windows yet. Do not start Phase 2 work without an explicit instruction referencing a completed legal review.

## 11. Working agreement for agents

Work milestone-by-milestone: M1 = P0-1…P0-6 + invariant suite green. M2 = P0-7, P0-8, full order-type set (§6.3), lifecycle automation (§6.4). M3 = §8 items 1–4. M4 = §8 items 5–7 + load test (500 concurrent simulated traders, invariants green). After each milestone: state what changed (migrations + files), show invariant/test results, list any deviations from this document with reasons. If a requirement here conflicts with observed reality in the repo, stop and flag it rather than silently reinterpreting.
