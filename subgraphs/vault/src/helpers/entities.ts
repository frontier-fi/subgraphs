import { Address, BigDecimal, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  Buffer,
  Pool,
  PoolToken,
  RateProvider,
  Token,
  Vault,
} from "../types/schema";
import { PoolShare } from "../types/schema";
import { ONE_BD, VAULT_ADDRESS, ZERO_ADDRESS, ZERO_BD, ZERO_BI } from "./constants";
import { PoolRegisteredTokenConfigStruct } from "../types/Vault/Vault";
import { ERC20 } from "../types/Vault/ERC20";
import { ERC4626 } from "../types/Vault/ERC4626";
import { VaultExtension } from "../types/Vault/VaultExtension";
import { scaleDown, scaleUp } from "./misc";
import { computeAggregateFeePercentageRaw, mulDown } from "./math";
import { ProtocolFeeController } from "../types/templates";

export function getVault(): Vault {
  let vault: Vault | null = Vault.load(VAULT_ADDRESS);
  if (vault != null) return vault;

  let vaultContract = VaultExtension.bind(changetype<Address>(VAULT_ADDRESS));
  let protocolFeeController = vaultContract.getProtocolFeeController();
  let authorizerCall = vaultContract.try_getAuthorizer();

  vault = new Vault(VAULT_ADDRESS);
  vault.isPaused = false;
  vault.isBuffersPaused = false;
  vault.authorizer = authorizerCall.reverted
    ? ZERO_ADDRESS
    : authorizerCall.value;
  vault.protocolSwapFee = ZERO_BD;
  vault.protocolYieldFee = ZERO_BD;
  vault.protocolFeeController = protocolFeeController;
  vault.save();

  ProtocolFeeController.create(protocolFeeController);

  return vault;
}

export function getPoolShareId(
  poolAddress: Address,
  userAddress: Address
): string {
  return poolAddress.toHex().concat("-").concat(userAddress.toHex());
}

export function getPoolShare(
  poolAddress: Address,
  userAddress: Address
): PoolShare {
  let poolShareId = getPoolShareId(poolAddress, userAddress);
  let poolShare = PoolShare.load(poolShareId);

  if (!poolShare) {
    poolShare = createPoolShare(poolAddress, userAddress);
  }

  return poolShare;
}

export function createPoolToken(
  poolAddress: Address,
  tokenConfig: PoolRegisteredTokenConfigStruct,
  index: i32
): void {
  let poolTokenId = poolAddress.concat(tokenConfig.token);
  let poolToken = PoolToken.load(poolTokenId);

  if (!poolToken) {
    poolToken = new PoolToken(poolTokenId);
  }

  let nestedPool = Pool.load(tokenConfig.token);

  let token = getToken(tokenConfig.token);

  poolToken.name = token.name;
  poolToken.symbol = token.symbol;
  poolToken.decimals = token.decimals;

  let buffer = Buffer.load(tokenConfig.token);

  let decimalDiff = 18 - poolToken.decimals;
  poolToken.scalingFactor = BigInt.fromI32(10).pow(u8(decimalDiff));

  poolToken.pool = poolAddress;
  poolToken.address = tokenConfig.token;
  poolToken.token = token.id;
  poolToken.index = index;
  poolToken.tokenType = tokenConfig.tokenType;
  poolToken.rateProvider = tokenConfig.rateProvider;
  poolToken.priceRate = ONE_BD;
  poolToken.balance = ZERO_BD;
  poolToken.volume = ZERO_BD;
  poolToken.totalSwapFee = ZERO_BD;
  poolToken.totalSwapFeeBase = ZERO_BD;
  poolToken.totalSwapFeeDelta = ZERO_BD;
  poolToken.totalStaticSwapFee = ZERO_BD;
  poolToken.totalDynamicSwapFee = ZERO_BD;
  poolToken.totalProtocolSwapFee = ZERO_BD;
  poolToken.totalProtocolYieldFee = ZERO_BD;
  poolToken.totalCreatorSwapFee = ZERO_BD;
  poolToken.totalCreatorYieldFee = ZERO_BD;
  poolToken.controllerProtocolFeeBalance = ZERO_BD;
  poolToken.controllerCreatorFeeBalance = ZERO_BD;
  poolToken.vaultProtocolSwapFeeBalance = ZERO_BD;
  poolToken.vaultProtocolYieldFeeBalance = ZERO_BD;
  poolToken.vaultCreatorSwapFeeBalance = ZERO_BD;
  poolToken.vaultCreatorYieldFeeBalance = ZERO_BD;
  poolToken.buffer = buffer ? buffer.id : null;
  poolToken.nestedPool = nestedPool ? nestedPool.id : null;
  poolToken.paysYieldFees = tokenConfig.paysYieldFees;
  poolToken.save();
}

export function createRateProvider(
  poolAddress: Address,
  tokenConfig: PoolRegisteredTokenConfigStruct
): void {
  // Always write a row, including address(0). The backend indexes
  // pool.rateProviders[i] in token registration order.
  let rateProviderId = poolAddress
    .concat(tokenConfig.token)
    .concat(tokenConfig.rateProvider);
  let rateProvider = RateProvider.load(rateProviderId);

  if (!rateProvider) {
    rateProvider = new RateProvider(rateProviderId);
  }

  rateProvider.pool = poolAddress;
  rateProvider.address = tokenConfig.rateProvider;
  rateProvider.token = poolAddress.concat(tokenConfig.token);
  rateProvider.save();
}

/** When a Buffer appears after PoolRegistered, link existing PoolTokens. */
export function linkBufferToPoolTokens(buffer: Buffer): void {
  let token = Token.load(buffer.id);
  if (!token) return;

  let poolTokens = token.poolTokens.load();
  for (let i = 0; i < poolTokens.length; i++) {
    let poolToken = poolTokens[i];
    poolToken.buffer = buffer.id;
    poolToken.save();
    let pool = Pool.load(poolToken.pool);
    if (pool) pool.save();
  }
}

/** When a Pool is registered, backfill nestedPool on PoolTokens that hold its BPT. */
export function linkNestedPoolToPoolTokens(poolAddress: Address): void {
  let token = Token.load(poolAddress);
  if (!token) return;

  let poolTokens = token.poolTokens.load();
  for (let i = 0; i < poolTokens.length; i++) {
    let poolToken = poolTokens[i];
    poolToken.nestedPool = poolAddress;
    poolToken.save();
    let pool = Pool.load(poolToken.pool);
    if (pool) pool.save();
  }
}

export function loadPoolToken(
  poolAddress: Address,
  tokenAddress: Address
): PoolToken {
  let poolTokenId = poolAddress.concat(tokenAddress);
  let poolToken = PoolToken.load(poolTokenId) as PoolToken;

  return poolToken;
}

export function createToken(tokenAddress: Address): void {
  let tokenContract = ERC20.bind(tokenAddress);

  let nameCall = tokenContract.try_name();
  let symbolCall = tokenContract.try_symbol();
  let decimalsCall = tokenContract.try_decimals();

  let token = new Token(tokenAddress);
  token.name = nameCall.reverted ? "" : nameCall.value;
  token.symbol = symbolCall.reverted ? "" : symbolCall.value;
  token.decimals = decimalsCall.reverted ? 0 : decimalsCall.value;
  token.address = tokenAddress;
  token.isErc4626 = false;
  token.underlyingToken = null;
  token.save();
}

/**
 * Flag tokenAddress as ERC-4626 and link its underlying Token when asset()
 * succeeds. Returns the underlying address, or null when asset() reverts.
 * Does not create a Buffer: Vault buffers only exist after initializeBuffer.
 */
export function probeErc4626(tokenAddress: Address): Address | null {
  let token = getToken(tokenAddress);
  if (token.isErc4626) {
    return changetype<Address>(token.underlyingToken!);
  }

  let assetCall = ERC4626.bind(tokenAddress).try_asset();
  if (assetCall.reverted || assetCall.value.equals(ZERO_ADDRESS)) {
    return null;
  }

  let underlyingToken = getToken(assetCall.value);
  token.isErc4626 = true;
  token.underlyingToken = underlyingToken.id;
  token.save();
  return assetCall.value;
}

export function getToken(tokenAddress: Address): Token {
  let token = Token.load(tokenAddress);

  if (!token) {
    createToken(tokenAddress);
    token = Token.load(tokenAddress);
  }

  return token as Token;
}

export function createPoolShare(
  poolAddress: Address,
  userAddress: Address
): PoolShare {
  let poolShareId = getPoolShareId(poolAddress, userAddress);
  let poolShare = new PoolShare(poolShareId);
  poolShare.user = userAddress;
  poolShare.pool = poolAddress;
  poolShare.balance = ZERO_BD;
  poolShare.save();

  return poolShare;
}

/**
 * Split a collected aggregate amount into protocol and creator shares.
 * Protocol is paid first; creator receives creatorPct of the remainder,
 * which is `amount * protocol / aggregate` and `amount - protocol`.
 */
export function splitAggregateAmount(
  amount: BigDecimal,
  protocolPct: BigDecimal,
  creatorPct: BigDecimal
): BigDecimal[] {
  if (amount.le(ZERO_BD)) {
    return [ZERO_BD, ZERO_BD];
  }
  if (creatorPct.le(ZERO_BD)) {
    return [amount, ZERO_BD];
  }
  if (protocolPct.le(ZERO_BD)) {
    return [ZERO_BD, amount];
  }

  let aggregateRaw = computeAggregateFeePercentageRaw(
    scaleUp(protocolPct, 18),
    scaleUp(creatorPct, 18)
  );
  if (aggregateRaw.le(ZERO_BI)) {
    return [ZERO_BD, ZERO_BD];
  }

  let protocolPart = amount
    .times(scaleUp(protocolPct, 18).toBigDecimal())
    .div(aggregateRaw.toBigDecimal());
  if (protocolPart.gt(amount)) {
    protocolPart = amount;
  }
  if (protocolPart.lt(ZERO_BD)) {
    protocolPart = ZERO_BD;
  }
  let creatorPart = amount.minus(protocolPart);
  if (creatorPart.lt(ZERO_BD)) {
    creatorPart = ZERO_BD;
  }
  return [protocolPart, creatorPart];
}

/**
 * Accrue vault-pending swap fees, split into protocol vs creator shares.
 * `aggregateFeeAmountRaw` is swapFeeAmount (or per-token swap fee raw) before
 * multiplying by the aggregate fee percentage.
 */
export function accrueVaultSwapFee(
  poolToken: PoolToken,
  pool: Pool,
  swapFeeAmountRaw: BigInt
): void {
  // The Vault skips aggregate swap fees while the pool is in Recovery Mode.
  if (pool.isInRecoveryMode) return;

  let aggregateAmount = scaleDown(
    mulDown(swapFeeAmountRaw, scaleUp(pool.aggregateSwapFee, 18)),
    poolToken.decimals
  );
  let parts = splitAggregateAmount(
    aggregateAmount,
    pool.protocolSwapFee,
    pool.poolCreatorSwapFee
  );
  poolToken.vaultProtocolSwapFeeBalance =
    poolToken.vaultProtocolSwapFeeBalance.plus(parts[0]);
  poolToken.vaultCreatorSwapFeeBalance =
    poolToken.vaultCreatorSwapFeeBalance.plus(parts[1]);
  poolToken.totalProtocolSwapFee = poolToken.totalProtocolSwapFee.plus(
    parts[0]
  );
  poolToken.totalCreatorSwapFee = poolToken.totalCreatorSwapFee.plus(parts[1]);
}

export function updateProtocolYieldFeeAmounts(pool: Pool): void {
  // Same gate as the Vault (PoolDataLib): no yield fees accrue at a zero
  // aggregate yield fee or in Recovery Mode. protocolFeeExempt is not enough:
  // exempt pools can still have creator or governance-set yield fees.
  if (pool.aggregateYieldFee.equals(ZERO_BD) || pool.isInRecoveryMode) return;

  let poolTokens = pool.tokens.load();
  let anyPaysYield = false;
  for (let i = 0; i < poolTokens.length; i++) {
    if (poolTokens[i].paysYieldFees) {
      anyPaysYield = true;
      break;
    }
  }
  if (!anyPaysYield) return;

  let vault = VaultExtension.bind(changetype<Address>(pool.vault));

  for (let i = 0; i < poolTokens.length; i++) {
    let poolToken = poolTokens[i];

    if (!poolToken.paysYieldFees) continue;

    let aggregateYieldFee = vault.try_getAggregateYieldFeeAmount(
      changetype<Address>(pool.address),
      changetype<Address>(poolToken.address)
    );

    if (aggregateYieldFee.reverted) continue;

    let aggregateAmount = scaleDown(
      aggregateYieldFee.value,
      poolToken.decimals
    );
    let previousProtocol = poolToken.vaultProtocolYieldFeeBalance;
    let previousCreator = poolToken.vaultCreatorYieldFeeBalance;
    let previousAggregate = previousProtocol.plus(previousCreator);
    let delta = aggregateAmount.minus(previousAggregate);

    if (delta.gt(ZERO_BD)) {
      // Split only the new accrual at current percentages; earlier pending
      // keeps the split it was accrued (and added to the totals) with.
      let parts = splitAggregateAmount(
        delta,
        pool.protocolYieldFee,
        pool.poolCreatorYieldFee
      );
      poolToken.vaultProtocolYieldFeeBalance = previousProtocol.plus(parts[0]);
      poolToken.vaultCreatorYieldFeeBalance = previousCreator.plus(parts[1]);
      poolToken.totalProtocolYieldFee =
        poolToken.totalProtocolYieldFee.plus(parts[0]);
      poolToken.totalCreatorYieldFee =
        poolToken.totalCreatorYieldFee.plus(parts[1]);
    } else if (delta.lt(ZERO_BD)) {
      // Pending shrank without a collect event seen yet: scale both shares down.
      if (aggregateAmount.le(ZERO_BD) || previousAggregate.le(ZERO_BD)) {
        poolToken.vaultProtocolYieldFeeBalance = ZERO_BD;
        poolToken.vaultCreatorYieldFeeBalance = ZERO_BD;
      } else {
        let protocolPart = previousProtocol
          .times(aggregateAmount)
          .div(previousAggregate);
        poolToken.vaultProtocolYieldFeeBalance = protocolPart;
        poolToken.vaultCreatorYieldFeeBalance = aggregateAmount.minus(protocolPart);
      }
    }

    poolToken.save();
  }
}

export function updatePoolTokenRates(pool: Pool): void {
  let poolTokens = pool.tokens.load();
  // STANDARD tokens (tokenType 0) have a fixed rate of 1. Skip the eth_call
  // unless some token can have a non-trivial rate.
  let needsRates = false;
  for (let i = 0; i < poolTokens.length; i++) {
    if (poolTokens[i].tokenType != 0) {
      needsRates = true;
      break;
    }
  }
  if (!needsRates) return;

  let vault = VaultExtension.bind(changetype<Address>(pool.vault));
  let ratesCall = vault.try_getPoolTokenRates(
    changetype<Address>(pool.address)
  );
  if (ratesCall.reverted) return;

  let tokenRates = ratesCall.value.value1;
  for (let i = 0; i < poolTokens.length; i++) {
    let poolToken = poolTokens[i];
    let idx = poolToken.index;
    if (idx < 0 || idx >= tokenRates.length) continue;
    poolToken.priceRate = scaleDown(tokenRates[idx], 18);
    poolToken.save();
  }
}

