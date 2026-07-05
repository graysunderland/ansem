// /api/wallet — Ansem's live SOL + $ANSEM balances via Helius RPC.
// Keeps the key server-side. Cached for 60s at the edge.

const MINT   = '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump';
const WALLET = 'GV6UUmNxz2RpKxmNAPadYKb7uQpszwqQAu3qLJxVdC52';

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
    const [bal, tok] = await Promise.all([
      rpc(endpoint, 'getBalance', [WALLET]),
      rpc(endpoint, 'getTokenAccountsByOwner', [WALLET, { mint: MINT }, { encoding: 'jsonParsed' }]),
    ]);

    const sol = (bal?.value ?? 0) / 1e9;
    const ansem = (tok?.value || []).reduce(
      (s, a) => s + (a.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0), 0);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ sol, ansem, updatedAt: Date.now() });
  } catch (e) {
    res.status(502).json({ error: 'rpc unavailable' });
  }
}
