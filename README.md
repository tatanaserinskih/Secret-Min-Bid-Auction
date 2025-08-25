# Secret Min Bid Auction — Private FHE Auction on Zama FHEVM (Sepolia) 🛡️🔒

A single-page dApp + Solidity contract that runs a **privacy-preserving “lowest bid wins” auction**.
Bids are encrypted client-side and **compared on-chain** using Zama’s **FHEVM**; results are revealed via **publicDecrypt** (global minimum) and **userDecrypt** (per-user win flag).

> **Frontend:** `index.html` (Ethers v6 + Zama Relayer SDK)
> **Contract:** `contracts/SecretMinBidAuction.sol` (TFHE `euint64` / `ebool`)

---

## ✨ Features

* 🔐 **Private bids** — the contract only receives a **handle + proof** (no plaintext).
* 🧮 **On-chain minimum** — encrypted running minimum maintained with `TFHE.lt` + `TFHE.cmux`.
* 👑 **Owner flow** — close bidding → publish results.
* 🔦 **Two kinds of reveal**

  * **Public minimum**: anyone can decrypt the minimal bid via `publicDecrypt`.
  * **Per-user win flag**: each bidder gets an `ebool` handle decryptable **only** by them via `userDecrypt`.
* 🖥️ **Polished SPA** — statuses, loading/encryption effects, simple logs.

---

## 🧰 Tech Stack

* **Solidity** `^0.8.20`
* **Zama FHEVM (TFHE)**: `fhevm/lib/TFHE.sol`
* **Ethers** `6.15.0` (ESM via CDN)
* **Relayer SDK JS** `0.1.2` (via CDN)
* **Network:** Sepolia `11155111`
* **Relayer:** `https://relayer.testnet.zama.cloud`
* **KMS (Sepolia):** `0x1364cBBf2cDF5032C47d8226a6f6FBD2AFCDacAC`

> Update these in `index.html` to your deployment:
>
> ```js
> const CONTRACT_ADDRESS = "0x2f5dB41809890eceaE6570e61fdE336F3C783c7E"; // example
> const KMS_ADDRESS      = "0x1364cBBf2cDF5032C47d8226a6f6FBD2AFCDacAC"; // Zama Sepolia KMS
> const RELAYER_URL      = "https://relayer.testnet.zama.cloud";
> ```

---

## 📦 Quick Start

### Prerequisites

* **Node.js** 18+
* **MetaMask** with **Sepolia** and some test ETH
* A dev server that sets COOP/COEP headers (for WASM workers)

### Install

```bash
npm i
```

### Compile & (optional) Deploy the Contract (Hardhat)

```bash
npx hardhat compile

# Example: deploy to Sepolia
npx hardhat run scripts/deploy.ts --network sepolia
# Take the deployed address and set CONTRACT_ADDRESS in index.html
```

### Serve the Frontend (COOP/COEP)

Opening `index.html` directly may fail due to WASM worker isolation. Use the included server:

```bash
node server.js
# open http://localhost:3000
```

*(Any dev server is fine if it sets `Cross-Origin-Opener-Policy: same-origin`
and `Cross-Origin-Embedder-Policy: require-corp`.)*

### Use the dApp

1. Click **Connect** → switch to **Sepolia** if prompted.
2. Enter **Bid Amount** (positive integer) → **PLACE BID**.
3. Owner clicks **Close Bidding** → **Publish Results**.
4. Everyone clicks **Get Win Status** → per-user decryption via EIP-712 signature. 🎉

---

## 📁 Project Structure (key files)

```
.
├─ index.html                      # full single-page frontend (Ethers + Relayer SDK)
├─ contracts/
│  └─ SecretMinBidAuction.sol      # main FHE auction contract
├─ server.js                       # simple server with COOP/COEP headers
├─ scripts/, tasks/, test/         # typical Hardhat-style helpers (optional)
├─ package.json
└─ tsconfig.json
```

> The large crypto/hash/EC dependency tree in `node_modules` is expected (Ethers + Relayer SDK).

---

## 📜 Contract API (summary)

```solidity
// public state
string  public version;              // "SecretMinBidAuction/1.0.0-sepolia"
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
```

---

## 🧠 How It Works

```
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
```

### Frontend snippets

**Encrypt & submit bid**

```js
const buf = relayer.createEncryptedInput(CONTRACT_ADDRESS, user);
buf.add64(bid);
const { handles, inputProof } = await buf.encrypt();
await contract.bid(handles[0], inputProof);
```

**User decrypts win flag**

```js
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
```

---

## ⚠️ ABI Sync Note (important)

The provided `index.html` uses:

* `finalize()` (frontend) **vs** `publishResults()` (contract)
* `resultsReady()` (frontend) **vs** `minPublished && winFlagsReady` (contract)

Choose **one** path:

* **Update the contract** to add shims:

  ```solidity
  function finalize() external onlyOwner { publishResults(); }
  function resultsReady() external view returns (bool) { return minPublished && winFlagsReady; }
  ```
* **OR update the frontend ABI** to call `publishResults()` and compute readiness as `minPublished && winFlagsReady`.

If you hit `staticCall` reverts or “function not found”, this mismatch is likely the cause.

---

## 🧪 Tips & Limits

* Demo only; **not audited** for production/mainnet.
* Bids are `euint64` (UI enforces `> 0`); **one bid per address**.
* Relayer/KMS are testnet services; occasional downtime is possible.
* WASM workers require **cross-origin isolation** → serve with COOP/COEP.

---

## 🧯 Troubleshooting

* **`Relayer unavailable / 5xx`** → testnet hiccup; try later.
* **`Please switch to Sepolia`** → switch/add network in MetaMask.
* **`staticCall revert / wrong function`** → see **ABI Sync Note**.
* **`SharedArrayBuffer` / COEP errors** → serve with proper COOP/COEP headers.
* **`KMS contract not found`** → verify `KMS_ADDRESS` for Sepolia.

---

## 📚 Useful Links

* Zama FHEVM Docs: [https://docs.zama.ai/fhevm](https://docs.zama.ai/fhevm)
* Solidity Guides (Relayer, decrypt flows, etc.): [https://docs.zama.ai/protocol/solidity-guides/](https://docs.zama.ai/protocol/solidity-guides/)

---

## 🔒 Security

Do **not** commit private keys or mnemonics. Treat this repository as a learning/demo project unless formally audited.

---

## 🗺️ Roadmap (ideas)

* Multiple lots / deadlines / refunds
* Off-chain winner notifications
* Threshold admin actions (M-of-N)
* Tie-breaking for equal minimums

---

## 🙏 Acknowledgements

* The Zama team & community for FHEVM 💚
* Ethers.js and the broader Ethereum OSS ecosystem

---

## 📄 License

MIT — see [`LICENSE`](LICENSE).
