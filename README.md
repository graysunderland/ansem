# $ANSEM WILL FLIP $PUMP

Live tracker for The Black Bull ($ANSEM). Static front-end + two tiny Vercel
functions. No database, no build step.

## Structure

```
index.html      the entire app
api/drops.js    indexes every airdrop from Ansem's wallet (Helius, server-side)
api/wallet.js   live wallet balances (Helius RPC, server-side)
vercel.json     function limits + daily cache-warm cron
```

## Deploy (5 minutes)

1. Push this folder to a GitHub repo.
2. vercel.com → Add New Project → import the repo. Framework preset: **Other**.
   No build command, no output directory. Deploy.
3. Grab a free API key at **helius.dev**.
4. Vercel → Project → Settings → Environment Variables:
   `HELIUS_API_KEY` = your key. Redeploy.

Done. The page loads drops from `/api/drops` (edge-cached, refreshes itself
every 10 minutes), wallet from `/api/wallet` (cached 60s). Market data and the
chart come straight from DexScreener, no key needed.

## How caching keeps costs at zero

`/api/drops` responds with `s-maxage=600, stale-while-revalidate=86400`.
After the first hit, every visitor is served from Vercel's edge cache
instantly; revalidation runs in the background. A viral day costs a handful
of Helius calls per hour, not per visitor. The daily cron keeps the cache
warm even with no traffic.

## Fallback mode

Opened as a bare file (no server), the page detects the missing API and
reveals a manual "Index the chain" control that reads Solana directly from
the browser. It rotates across three public RPC providers with adaptive
backoff, saves progress to the browser as it goes, and resumes from where
it stopped — retrying is always safe and revisits only fetch what's new.
An optional paste-in Helius key makes it fast; the key never leaves the tab.

## Notes

- Hobby-plan crons run at most daily; that's fine here because visitor
  traffic revalidates the cache anyway. Upgrade to Pro if you want the
  cron hourly.
- If $ANSEM volume explodes and the wallet history grows past ~12,000
  transactions, raise `MAX_PAGES` in `api/drops.js`.
- Donation address and all constants live at the top of each file.
- Before launch: replace YOUR-DOMAIN.com in the og:/twitter: meta tags in
  index.html with your real domain so link previews show the OG card.
