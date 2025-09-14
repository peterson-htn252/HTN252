// app/api/xrpl/send-dev/route.ts
import * as xrpl from "xrpl";

export const runtime = "nodejs"; // WebSockets need Node runtime

const WS_ENDPOINTS = [
  "wss://s.altnet.rippletest.net:51233/",  // official testnet
  "wss://testnet.xrpl-labs.com",          // alt
];

type JsonRpcReq = { method: string; params?: any[] };

async function rpc(url: string, body: JsonRpcReq) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`RPC ${body.method} HTTP ${r.status}`);
  const j = await r.json();
  if (j?.result?.status === "error") {
    throw new Error(`RPC ${body.method} error: ${JSON.stringify(j.result)}`);
  }
  return j.result;
}

async function sendViaHttpJsonRpc(to: string, amountXrp: number, seed: string) {
  // JSON-RPC endpoint (HTTP) — avoids WebSockets entirely
  const RPC = "https://s.altnet.rippletest.net:51234/";

  // 1) Get account sequence
  const wallet = xrpl.Wallet.fromSeed(seed);
  const ai = await rpc(RPC, {
    method: "account_info",
    params: [{ account: wallet.address, ledger_index: "current", strict: true }],
  });
  const sequence: number = ai?.account_data?.Sequence;

  // 2) Get fee
  const fee = await rpc(RPC, { method: "fee" });
  const dropsFee: string = fee?.drops?.open_ledger_fee || "12"; // safe default

  // 3) Get ledger for LastLedgerSequence
  const si = await rpc(RPC, { method: "server_info" });
  const currentLedger = si?.info?.validated_ledger?.seq || si?.info?.complete_ledgers?.split("-")?.[1];
  const lastLedgerSequence = Number(currentLedger) + 20;

  // 4) Build + sign
  const tx: xrpl.Payment = {
    TransactionType: "Payment",
    Account: wallet.address,
    Destination: to,
    Amount: xrpl.xrpToDrops(amountXrp),
    Fee: dropsFee,
    Sequence: sequence,
    LastLedgerSequence: lastLedgerSequence,
  };

  const { tx_blob } = wallet.sign(tx);

  // 5) Submit
  const submit = await rpc(RPC, { method: "submit", params: [{ tx_blob }] });
  const engine = submit?.engine_result;
  const hash = submit?.tx_json?.hash || submit?.tx?.hash;

  if (!hash) throw new Error(`Submit returned no hash (engine=${engine})`);
  return { hash, engine };
}

async function sendViaWs(to: string, amountXrp: number, seed: string) {
  let lastErr: any = null;

  for (const url of WS_ENDPOINTS) {
    const client = new xrpl.Client(url);
    try {
      await client.connect();

      const wallet = xrpl.Wallet.fromSeed(seed);
      const prepared = await client.autofill({
        TransactionType: "Payment",
        Account: wallet.address,
        Destination: to,
        Amount: xrpl.xrpToDrops(amountXrp),
      });

      const signed = wallet.sign(prepared);
      const res = await client.submitAndWait(signed.tx_blob);
      // @ts-ignore
      const hash = res?.result?.hash || res?.tx_json?.hash;
      const engine = res?.result?.engine_result;
      if (!hash) throw new Error(`WS submit no hash (engine=${engine})`);

      return { hash, engine, endpoint: url };
    } catch (e) {
      lastErr = e;
    } finally {
      try { if (client.isConnected()) await client.disconnect(); } catch {}
    }
  }
  throw lastErr || new Error("WS failed on all endpoints");
}

export async function POST(req: Request) {
  try {
    const { to, amountXrp } = await req.json();

    if (!process.env.XRPL_HOT_WALLET_SEED)
      return Response.json({ error: "XRPL_HOT_WALLET_SEED missing in env" }, { status: 500 });

    if (!to || typeof to !== "string" || !to.startsWith("r"))
      return Response.json({ error: "Invalid 'to' address (must start with 'r')" }, { status: 400 });

    const amount = Number(amountXrp);
    if (!Number.isFinite(amount) || amount <= 0)
      return Response.json({ error: "Invalid amountXrp" }, { status: 400 });

    // If destination is brand new, first funding must meet reserve (~10 XRP on testnet)
    // Use >= 12 XRP to be safe for first-time funding.

    try {
      // Try WebSocket first (best UX: autofill)
      const { hash, engine, endpoint } = await sendViaWs(
        to,
        amount,
        process.env.XRPL_HOT_WALLET_SEED!
      );
      return Response.json({ ok: true, txHash: hash, engine_result: engine, via: "ws", endpoint });
    } catch (wsErr: any) {
      // Fallback to HTTP JSON-RPC if WS fails (like your DNS error)
      const { hash, engine } = await sendViaHttpJsonRpc(
        to,
        amount,
        process.env.XRPL_HOT_WALLET_SEED!
      );
      return Response.json({ ok: true, txHash: hash, engine_result: engine, via: "http" });
    }
  } catch (e: any) {
    return Response.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
