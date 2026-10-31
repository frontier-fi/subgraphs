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
import { ONE_BD, VAULT_ADDRESS, ZERO_ADDRESS, ZERO_BD } from "./constants";
import { PoolRegisteredTokenConfigStruct } from "../types/Vault/Vault";
import { ERC20 } from "../types/Vault/ERC20";
import { VaultExtension } from "../types/Vault/VaultExtension";
import { scaleDown } from "./misc";
import { mulDownSwapFee } from "./math";
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
  // STANDARD tokens use address(0); do not create junk RateProvider rows.
  if (tokenConfig.rateProvider.equals(ZERO_ADDRESS)) {
    return;
  }

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
  token.save();
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

export function poolAggregateSwapFee(pool: Pool): BigDecimal {
  return pool.protocolSwapFee.plus(pool.poolCreatorSwapFee);
}

export function poolAggregateYieldFee(pool: Pool): BigDecimal {
  return pool.protocolYieldFee.plus(pool.poolCreatorYieldFee);
}

function splitAggregateFee(
  aggregateAmount: BigDecimal,
  protocolPct: BigDecimal,
  creatorPct: BigDecimal
): BigDecimal[] {
  let totalPct = protocolPct.plus(creatorPct);
  if (totalPct.equals(ZERO_BD) || aggregateAmount.equals(ZERO_BD)) {
    return [ZERO_BD, ZERO_BD];
  }
  let protocolPart = aggregateAmount.times(protocolPct).div(totalPct);
  let creatorPart = aggregateAmount.minus(protocolPart);
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
  let aggregateFee = poolAggregateSwapFee(pool);
  let aggregateAmount = scaleDown(
    mulDownSwapFee(swapFeeAmountRaw, aggregateFee),
    poolToken.decimals
  );
  let parts = splitAggregateFee(
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
  let vault = VaultExtension.bind(changetype<Address>(pool.vault));

  let poolTokens = pool.tokens.load();
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
    let previousAggregate = poolToken.vaultProtocolYieldFeeBalance.plus(
      poolToken.vaultCreatorYieldFeeBalance
    );
    let delta = aggregateAmount.minus(previousAggregate);
    let parts = splitAggregateFee(
      delta.gt(ZERO_BD) ? delta : ZERO_BD,
      pool.protocolYieldFee,
      pool.poolCreatorYieldFee
    );

    let split = splitAggregateFee(
      aggregateAmount,
      pool.protocolYieldFee,
      pool.poolCreatorYieldFee
    );
    poolToken.vaultProtocolYieldFeeBalance = split[0];
    poolToken.vaultCreatorYieldFeeBalance = split[1];

    if (delta.gt(ZERO_BD)) {
      poolToken.totalProtocolYieldFee =
        poolToken.totalProtocolYieldFee.plus(parts[0]);
      poolToken.totalCreatorYieldFee =
        poolToken.totalCreatorYieldFee.plus(parts[1]);
    }

    poolToken.save();
  }
}

/**
 * After a protocol fee collect, resync vault pending balances from chain.
 * Remaining aggregate is attributed first to any leftover protocol pending,
 * then to creator (creator share leaves the Vault in the same collect tx
 * without a dedicated event).
 */
export function syncVaultAggregateSwapFeeFromChain(
  poolToken: PoolToken,
  pool: Pool
): void {
  let vault = VaultExtension.bind(changetype<Address>(pool.vault));
  let call = vault.try_getAggregateSwapFeeAmount(
    changetype<Address>(pool.address),
    changetype<Address>(poolToken.address)
  );
  if (call.reverted) return;

  let remaining = scaleDown(call.value, poolToken.decimals);
  let protocolPending = poolToken.vaultProtocolSwapFeeBalance;
  if (protocolPending.lt(ZERO_BD)) {
    protocolPending = ZERO_BD;
  }

  let creatorBefore = poolToken.vaultCreatorSwapFeeBalance;

  if (protocolPending.gt(remaining)) {
    poolToken.vaultProtocolSwapFeeBalance = remaining;
    poolToken.vaultCreatorSwapFeeBalance = ZERO_BD;
  } else {
    poolToken.vaultProtocolSwapFeeBalance = protocolPending;
    poolToken.vaultCreatorSwapFeeBalance = remaining.minus(protocolPending);
  }

  let creatorMoved = creatorBefore.minus(
    poolToken.vaultCreatorSwapFeeBalance
  );
  if (creatorMoved.gt(ZERO_BD)) {
    poolToken.controllerCreatorFeeBalance =
      poolToken.controllerCreatorFeeBalance.plus(creatorMoved);
  }
}

export function updatePoolTokenRates(pool: Pool): void {
  let vault = VaultExtension.bind(changetype<Address>(pool.vault));
  let ratesCall = vault.try_getPoolTokenRates(
    changetype<Address>(pool.address)
  );
  if (ratesCall.reverted) return;

  let tokenRates = ratesCall.value.value1;
  let poolTokens = pool.tokens.load();
  for (let i = 0; i < poolTokens.length; i++) {
    let poolToken = poolTokens[i];
    let idx = poolToken.index;
    if (idx < 0 || idx >= tokenRates.length) continue;
    poolToken.priceRate = scaleDown(tokenRates[idx], 18);
    poolToken.save();
  }
}

