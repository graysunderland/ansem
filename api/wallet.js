// /api/wallet — Ansem's live SOL + $ANSEM balances, from the discovered
// holding wallet (the largest human holder of the mint). Cached 60s.

import { discoverWallets } from './drops.js';

const MINT = '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump';

async function rpc(endpoint, method, params) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

export default async function handler(req, res) {
  const key = process.env.HELIUS_API_KEY;
  const endpoint = key
    ? `https://mainnet.helius-rpc.com/?api-key=${key}`
    : 'https://api.mainnet-beta.solana.com';

  try {
    const { main } = await discoverWallets(endpoint);
    const [bal, tok] = await Promise.all([
      rpc(endpoint, 'getBalance', [main]),
      rpc(endpoint, 'getTokenAccountsByOwner', [main, { mint: MINT }, { encoding: 'jsonParsed' }]),
    ]);

    const sol = (bal?.value ?? 0) / 1e9;
    const ansem = (tok?.value || []).reduce(
      (s, a) => s + (a.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0), 0);

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ wallet: main, sol, ansem, updatedAt: Date.now() });
  } catch (e) {
    res.status(502).json({ error: 'rpc unavailable' });
  }
}
