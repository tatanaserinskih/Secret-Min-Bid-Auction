// deploy/deploy.ts
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, network } = hre;
  const { deploy, execute, read, log, getArtifact } = deployments;
  const { deployer } = await getNamedAccounts();

  const envFQN = process.env.FQN?.trim(); // опционально: точный FQN артефакта
  const waitConfirmations = Number(process.env.WAIT_CONFIRMATIONS ?? 1);

  // ── 1) Поиск артефакта ─────────────────────────────────────────────
  const candidates: string[] = [
    ...(envFQN ? [envFQN] : []),
    "SecretMinBidAuction",
    "contracts/SecretMinBidAuction.sol:SecretMinBidAuction",
    "contracts/auction/SecretMinBidAuction.sol:SecretMinBidAuction",
    "src/SecretMinBidAuction.sol:SecretMinBidAuction",
  ];

  let contractId: string | null = null;
  for (const c of candidates) {
    try {
      await getArtifact(c);
      contractId = c;
      break;
    } catch {}
  }
  if (!contractId) {
    throw new Error(
      `Cannot find artifact for SecretMinBidAuction. ` +
        `Make sure the contract is compiled and try one of: ${candidates.join(", ")}`,
    );
  }

  log(`🔨 Deploying SecretMinBidAuction… (artifact: ${contractId})`);

  // ── 2) Деплой ──────────────────────────────────────────────────────
  const d = await deploy("SecretMinBidAuction", {
    from: deployer,
    contract: contractId,
    args: [], // constructor() без аргументов
    log: true,
    waitConfirmations,
  });

  // ── 3) Быстрые проверки живости ────────────────────────────────────
  try {
    const ver: string = await read("SecretMinBidAuction", "version");
    const open: boolean = await read("SecretMinBidAuction", "biddingOpen");
    const ready: boolean = await read("SecretMinBidAuction", "resultsReady");
    const count: bigint = await read("SecretMinBidAuction", "participantsCount");
    log(
      `✅ Deployed at ${d.address} on ${network.name} ` +
        `(version: ${ver}, biddingOpen: ${open}, resultsReady: ${ready}, participants: ${count.toString()})`,
    );
  } catch {
    log(`✅ Deployed at ${d.address} on ${network.name}`);
  }

  // ── 4) Опциональные шаги через ENV ─────────────────────────────────
  // CLOSE=1|true     — закрыть приём ставок (если открыт и есть хотя бы 1 ставка)
  // FINALIZE=1|true  — финализировать (если закрыто, не финализировано и есть участники)
  const CLOSE = (process.env.CLOSE ?? "").toLowerCase();
  const FINALIZE = (process.env.FINALIZE ?? "").toLowerCase();
  const doClose = CLOSE === "1" || CLOSE === "true";
  const doFinalize = FINALIZE === "1" || FINALIZE === "true";

  if (doClose) {
    const isOpen: boolean = await read("SecretMinBidAuction", "biddingOpen");
    if (!isOpen) {
      log("ℹ️ Bidding already closed");
    } else {
      const count: bigint = await read("SecretMinBidAuction", "participantsCount");
      if ((count ?? 0n) > 0n) {
        log("🔒 Closing bidding…");
        await execute("SecretMinBidAuction", { from: deployer, log: true }, "closeBidding");
        log("🔒 Bidding closed");
      } else {
        log("⚠️ Cannot close: no bids yet");
      }
    }
  }

  if (doFinalize) {
    const isOpen: boolean = await read("SecretMinBidAuction", "biddingOpen");
    const ready: boolean = await read("SecretMinBidAuction", "resultsReady");
    const count: bigint = await read("SecretMinBidAuction", "participantsCount");

    if (isOpen) {
      log("⚠️ Cannot finalize: bidding is still open. Set CLOSE=1 first.");
    } else if (ready) {
      log("ℹ️ Already finalized");
    } else if ((count ?? 0n) === 0n) {
      log("⚠️ Cannot finalize: no participants");
    } else {
      log("🏁 Finalizing auction (prepare winner flags)…");
      await execute("SecretMinBidAuction", { from: deployer, log: true }, "finalize");
      log("🏁 Finalization complete (winner flags granted)");
    }
  }

  console.log(`SecretMinBidAuction contract: ${d.address}`);
};

export default func;
func.id = "deploy_secret_min_bid_auction"; // чтобы hardhat-deploy не выполнял повторно
func.tags = ["SecretMinBidAuction"];
