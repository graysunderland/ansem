// /api/drops — indexes every outbound $ANSEM transfer from Ansem's wallets.
// The $ANSEM stash lives in a holding wallet, not the pump.fun creator-fee
// wallet, so we discover it live: the largest human holder of the mint
// (pool authorities are program-owned PDAs; human wallets are system-owned).
// Edge-cached with stale-while-revalidate so traffic spikes cost nothing.

const MINT = '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump';
const CREATOR_WALLET = 'GV6UUmNxz2RpKxmNAPadYKb7uQpszwqQAu3qLJxVdC52';
const SYSTEM_PROGRAM = '11111111111111111111111111111111';
const MAX_PAGES = 120;

const sleep = ms => new Promise(r => setTimeout(r, ms));

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

export async function discoverWallets(endpoint) {
  const wallets = [CREATOR_WALLET];
  let main = CREATOR_WALLET;
  try {
    const top = await rpc(endpoint, 'getTokenLargestAccounts', [MINT]);
    const tokAccts = (top?.value || []).slice(0, 12).map(v => ({ addr: v.address, amt: v.uiAmount || 0 }));
    const infos = await rpc(endpoint, 'getMultipleAccounts', [tokAccts.map(t => t.addr), { encoding: 'jsonParsed' }]);
    const owners = [];
    (infos?.value || []).forEach((a, i) => {
      const o = a?.data?.parsed?.info?.owner;
      if (o) owners.push({ owner: o, amt: tokAccts[i].amt });
    });
    const ownerInfos = await rpc(endpoint, 'getMultipleAccounts', [owners.map(o => o.owner), { encoding: 'jsonParsed' }]);
    const humans = [];
    (ownerInfos?.value || []).forEach((a, i) => {
      if (!a || a.owner === SYSTEM_PROGRAM) humans.push(owners[i]);
    });
    humans.sort((a, b) => b.amt - a.amt);
    if (humans.length) {
      main = humans[0].owner;
      if (!wallets.includes(main)) wallets.unshift(main);
    }
  } catch (e) {}
  return { wallets, main };
}

export default async function handler(req, res) {
  const key = process.env.HELIUS_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'HELIUS_API_KEY is not set in Vercel env vars' });
    return;
  }
  const endpoint = `https://mainnet.helius-rpc.com/?api-key=${key}`;
  const { wallets, main } = await discoverWallets(endpoint);

  const drops = [];
  const seen = new Set();
  const started = Date.now();
  const TIME_BUDGET = 45000;

  for (const w of wallets) {
    let before = '', pages = 0, retries = 0;
    while (pages < MAX_PAGES && Date.now() - started < TIME_BUDGET) {
      const url =
        `https://api.helius.xyz/v0/addresses/${w}/transactions` +
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
            t.fromUserAccount === w &&
            t.toUserAccount &&
            !wallets.includes(t.toUserAccount) &&
            t.tokenAmount > 0
          ) {
            const k = tx.signature + '|' + t.toUserAccount;
            if (!seen.has(k)) {
              seen.add(k);
              drops.push({ to: t.toUserAccount, amount: t.tokenAmount, ts: tx.timestamp, sig: tx.signature });
            }
          }
        }
      }

      before = batch[batch.length - 1].signature;
      pages++;
      await sleep(80);
    }
  }

  drops.sort((a, b) => b.ts - a.ts);

  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ updatedAt: Date.now(), wallet: main, wallets, count: drops.length, drops });
}
