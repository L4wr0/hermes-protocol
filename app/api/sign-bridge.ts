// /api/sign-bridge.ts
// Oracle 1 — Bridge signer.
// Receives (user, amount, nonce) from frontend after a darkBridgeToRise() event
// on Base. Signs the message so the user can call claimFromInco() on RISE
// and unlock the bridged ETH.
//
// Triggered: on-demand via POST from frontend.
// Auth:      none (idempotent — replay protected by usedSignatures on chain).
//
// ENV VARS (Vercel):
//   ORACLE1_SK         — private key of the oracle wallet (must match
//                        the `oracle` address set on IncoCollateralBridge)
//   BRIDGE_RISE_ADDR   — bridge contract address on RISE (for sanity logging)
//   VAULT_BASE_ADDR    — vault on Base (for sanity logging)

import { ethers } from 'ethers';

export const config = {
  runtime: 'edge',
};

interface SignRequest {
  user: string;       // 0x-prefixed
  amount: string;     // wei as string (uint128)
  nonce: string;      // nonce as string (uint256)
}

interface SignResponse {
  signature: string;
  signer: string;
  messageHash: string;
}

const ORACLE_SK = process.env.ORACLE1_SK;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!ORACLE_SK || !ORACLE_SK.startsWith('0x')) {
    return new Response(
      JSON.stringify({ error: 'Oracle key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: SignRequest;
  try {
    body = (await req.json()) as SignRequest;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate inputs
  if (!body.user || !ethers.isAddress(body.user)) {
    return new Response(
      JSON.stringify({ error: 'Invalid user address' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let amountBN: bigint;
  let nonceBN: bigint;
  try {
    amountBN = BigInt(body.amount);
    nonceBN  = BigInt(body.nonce);
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid amount or nonce (must be uint string)' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // uint128 ceiling check
  if (amountBN > (1n << 128n) - 1n) {
    return new Response(
      JSON.stringify({ error: 'Amount exceeds uint128 max' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Build the message hash exactly as the contract does:
  //   keccak256(abi.encodePacked(msg.sender, amount, nonce))
  // where msg.sender = body.user, amount = uint128, nonce = uint256
  const messageHash = ethers.solidityPackedKeccak256(
    ['address', 'uint128', 'uint256'],
    [body.user, amountBN, nonceBN]
  );

  // Sign as Ethereum personal_sign (the contract prefixes "\x19Ethereum Signed Message:\n32")
  const wallet = new ethers.Wallet(ORACLE_SK);
  const signature = await wallet.signMessage(ethers.getBytes(messageHash));

  const response: SignResponse = {
    signature,
    signer: wallet.address,
    messageHash,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
