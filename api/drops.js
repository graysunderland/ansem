// /api/drops — indexes every outbound $ANSEM transfer from Ansem's wallet.
// Runs server-side with HELIUS_API_KEY from env. Edge-cached: after the first
// hit, visitors are served instantly from cache and revalidation happens in
// the background, so traffic spikes cost almost nothing.

const MINT   = '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump';
const WALLET = 'GV6UUmNxz2RpKxmNAPadYKb7uQpszwqQAu3qLJxVdC52';
const MAX_PAGES = 120; // 12,000 transactions deep

const sleep = ms => new Promise(r => setTimeout(r, ms));

export default async function handler(req, res) {
  const key = process.env.HELIUS_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'HELIUS_API_KEY is not set in Vercel env vars' });
    return;
  }

  const drops = [];
  let before = '', pages = 0, retries = 0;

  while (pages < MAX_PAGES) {
    const url =
      `https://api.helius.xyz/v0/addresses/${WALLET}/transactions` +
      `?api-key=${key}&limit=100` + (before ? `&before=${before}` : '');

    const r = await fetch(url);
    if (r.status === 429) {
      if (++retries > 6) break;
      await sleep(1000 * retries);
      continue;
    }
    if (!r.ok) break;
    retries = 0;

    const batch = await r.json();
    if (!Array.isArray(batch) || !batch.length) break;

    for (const tx of batch) {
      for (const t of tx.tokenTransfers || []) {
        if (
          t.mint === MINT &&
          t.fromUserAccount === WALLET &&
          t.toUserAccount &&
          t.toUserAccount !== WALLET &&
          t.tokenAmount > 0
        ) {
          drops.push({
            to: t.toUserAccount,
            amount: t.tokenAmount,
            ts: tx.timestamp,
            sig: tx.signature,
          });
        }
      }
    }

    before = batch[batch.length - 1].signature;
    pages++;
    await sleep(80);
  }

  drops.sort((a, b) => b.ts - a.ts);

  // 10 min fresh, then serve stale for a day while revalidating in background
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ updatedAt: Date.now(), count: drops.length, drops });
}
