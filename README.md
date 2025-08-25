Secret Min Bid Auction — Private FHE Auction on Zama FHEVM (Sepolia) 🛡️🔒

TL;DR: Lowest bid wins, bids stay private. Encryption & comparisons happen on-chain with Zama FHEVM; results are revealed via publicDecrypt / userDecrypt.
Frontend is a single index.html (Ethers v6 + Zama Relayer SDK). Contract is SecretMinBidAuction.sol (TFHE euint64/ebool).

✨ Features

Private bids: encrypted in the browser via Relayer SDK → contract only receives handle + proof.

On-chain minimum: encrypted running minimum using TFHE.lt + TFHE.cmux.

Owner flow: close bidding → publish results.

Two ways to reveal:

Public minimum (anyone can publicDecrypt the min handle).

Per-user win flag (each bidder gets a handle of ebool decryptable only by them via userDecrypt).

Smooth UI/UX: single-page app with statuses, loading/encryption effects, and guardrails.

🧠 How it works
Browser (MetaMask + Relayer SDK)      Smart Contract (Zama FHEVM)
----------------------------------    ----------------------------------------
bid -> encrypt -> handle/proof  --->  bid(handle, proof)
                                      - import encrypted bid
                                      - keep encrypted MIN with TFHE.lt/cmux
                                      - mark sender as participated

owner: closeBidding()                 // stop new bids
owner: publishResults()               // expose min handle (publicDecrypt)
                                      // seal per-user win flags (userDecrypt)

user: getMyWinFlagHandle()            // handle(ebool) -> userDecrypt via EIP-712

🧰 Tech stack

Solidity ^0.8.20

Zama FHEVM (TFHE): fhevm/lib/TFHE.sol

Ethers 6.15.0 (ESM via CDN)

Relayer SDK JS 0.1.2 (via CDN)

Network: Sepolia 11155111

Relayer: https://relayer.testnet.zama.cloud

KMS (Sepolia): 0x1364cBBf2cDF5032C47d8226a6f6FBD2AFCDacAC

Update constants in index.html:
CONTRACT_ADDRESS, KMS_ADDRESS, RELAYER_URL.

📁 Repository layout (high level)
index.html                      # the entire frontend
contracts/SecretMinBidAuction.sol
server.js                       # simple local server with COOP/COEP headers (optional)
scripts/, tasks/, test/         # common Hardhat-style helpers (optional)
package.json, tsconfig.json


Lots of crypto/hash/EC libs in node_modules is expected (Ethers + Relayer SDK).

🚀 Quick start
0) Prerequisites

Node 18+

MetaMask with Sepolia and a bit of test ETH

(Recommended) serve with COOP/COEP headers (WASM + workers need cross-origin isolation)

1) Deploy the contract (Hardhat example)
npm i
npx hardhat compile
npx hardhat run scripts/deploy.ts --network sepolia
# copy deployed address -> set CONTRACT_ADDRESS in index.html

2) Serve the frontend

Why a server? WebAssembly workers generally require COOP/COEP headers. Opening the file directly may fail.

node server.js   # serves with the right headers
# open http://localhost:3000


(Or use any dev server you prefer; just ensure it sets Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp.)

3) Use the dApp

Click Connect → switch to Sepolia if prompted.

Enter Bid Amount (positive integer) → PLACE BID.

Owner clicks Close Bidding → Publish Results.

Everyone clicks Get Win Status → per-user decryption (EIP-712 signature in MetaMask). 🎉

🔌 Contract API (current)
// public state
string  public version;              // e.g. "SecretMinBidAuction/1.0.0-sepolia"
address public owner;
bool    public biddingOpen;          // true until closed
bool    public minPublished;         // has public min handle been published?
bool    public winFlagsReady;        // are per-user flags prepared?
bytes32 public minBidHandle;         // handle(euint64) for publicDecrypt

// views
function participantsCount() external view returns (uint256);
function getMinBidHandle() external view returns (bytes32);
function getMyWinFlagHandle() external view returns (bytes32);
function getWinFlagHandle(address user) external view returns (bytes32);

// actions
function bid(bytes32 bidExt, bytes calldata proof) external;
function closeBidding() external;            // onlyOwner
function publishResults() external;          // onlyOwner

🖼️ Frontend flow (code snippets)

Encrypt & submit bid

const buf = relayer.createEncryptedInput(CONTRACT_ADDRESS, user);
buf.add64(bid);
const { handles, inputProof } = await buf.encrypt();
await contract.bid(handles[0], inputProof);


User decrypts win flag

const handle = await contract.getMyWinFlagHandle();
const kp = await generateKeypair();

const startTs = Math.floor(Date.now() / 1000).toString();
const days = "7";

const eip712 = relayer.createEIP712(kp.publicKey, [CONTRACT_ADDRESS], startTs, days);
const sig = await signer.signTypedData(
  eip712.domain,
  { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
  eip712.message
);

const out = await relayer.userDecrypt(
  [{ handle, contractAddress: CONTRACT_ADDRESS }],
  kp.privateKey, kp.publicKey,
  sig.replace("0x", ""),
  [CONTRACT_ADDRESS],
  user, startTs, days
);

const isWinner = Number(BigInt(out[handle])) === 1;

⚠️ ABI sync note (important)

The sample index.html currently references:

finalize() instead of publishResults()

resultsReady() instead of checking minPublished && winFlagsReady

Pick one of the following:

Update the contract to match the frontend:

function finalize() external onlyOwner { publishResults(); }
function resultsReady() external view returns (bool) { return minPublished && winFlagsReady; }


OR

Update the frontend ABI & calls to use publishResults() and compute readiness as minPublished && winFlagsReady.

If you see staticCall reverts or “function not found”, this mismatch is the usual suspect.

🧪 Limits & notes

Demo only; not audited for production/mainnet.

Bids are euint64 (UI enforces > 0).

One bid per address.

Relayer/KMS are testnet infra; occasional downtime can happen.

Cross-origin isolation required for WASM workers (serve with COOP/COEP).

🧯 Troubleshooting

Relayer unavailable / 5xx → testnet infra hiccup. Try later.

Please switch to Sepolia → switch/add network in MetaMask.

staticCall revert / wrong function → ABI mismatch (see ABI sync note).

SharedArrayBuffer / COEP errors → run behind a server that sets COOP/COEP headers.

KMS contract not found → verify KMS_ADDRESS for your network.

🔒 Security

Don’t commit private keys or mnemonic phrases.

Treat this as a learning/demo project until you complete a proper audit.

🗺️ Roadmap (ideas)

Multiple lots / deadlines / refunds.

Off-chain notifications for winners.

Threshold admin actions (M-of-N).

Tie-breaking policies for equal minimums.

🙏 Acknowledgements

Zama FHEVM
 and the TFHE toolchain.

Ethers.js and the broader Ethereum OSS community. 💚
