import type { CreditTransactionDto, CreditsOverview, Currency, PricingInfo } from "@bannerai/shared";
import { CREDIT_PACKS } from "@bannerai/shared";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { prisma } from "../../database/prisma.js";
import type { CreditTransaction, Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../utils/errors.js";

/** 402 Payment Required: not enough credits for the requested action. */
export class InsufficientCreditsError extends AppError {
  constructor(required: number, balance: number) {
    super(402, "insufficient_credits", `This action costs ${required} credit(s) but your balance is ${balance}.`, { details: { required, balance }, expose: true });
  }
}

type Tx = Prisma.TransactionClient;

export function toCreditTransactionDto(t: CreditTransaction): CreditTransactionDto {
  return {
    id: t.id,
    type: t.type,
    amount: t.amount,
    balanceAfter: t.balanceAfter,
    description: t.description,
    generationId: t.generationId,
    packId: t.packId,
    currency: t.currency,
    amountPaid: t.amountPaid,
    createdAt: t.createdAt.toISOString(),
  };
}

/**
 * Credit accounting. Every movement is an append-only ledger row and the user's materialized
 * balance is updated in the same transaction under a row lock, so concurrent requests can never
 * overspend. Holds are taken when a job is queued and released when it fails.
 */
export class CreditsService {
  readonly costs = { generation: env.CREDIT_COST_GENERATION, edit: env.CREDIT_COST_EDIT };
  readonly trialCredits = env.TRIAL_CREDITS;

  costFor(kind: "initial" | "edit"): number {
    return kind === "initial" ? this.costs.generation : this.costs.edit;
  }

  pricing(defaultCurrency: Currency = "brl"): PricingInfo {
    return {
      costs: this.costs,
      trialCredits: this.trialCredits,
      packs: CREDIT_PACKS.map((p) => ({ id: p.id, credits: p.credits, prices: p.prices, highlight: p.highlight })),
      purchasesEnabled: Boolean(env.STRIPE_SECRET_KEY),
      defaultCurrency,
    };
  }

  /** Locks the user's row and returns the current balance. Must run inside a transaction. */
  private async lockBalance(tx: Tx, userId: string): Promise<number> {
    const rows = await tx.$queryRaw<Array<{ credit_balance: number }>>`SELECT credit_balance FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new AppError(404, "not_found", "User not found");
    return rows[0]!.credit_balance;
  }

  private async record(
    tx: Tx,
    userId: string,
    balance: number,
    entry: Omit<Prisma.CreditTransactionUncheckedCreateInput, "userId" | "balanceAfter">,
  ): Promise<CreditTransaction> {
    const balanceAfter = balance + entry.amount;
    await tx.user.update({ where: { id: userId }, data: { creditBalance: balanceAfter } });
    return tx.creditTransaction.create({ data: { ...entry, userId, balanceAfter } });
  }

  async getBalance(userId: string): Promise<number> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { creditBalance: true } });
    return user?.creditBalance ?? 0;
  }

  /** Grants the free trial exactly once per account. Returns the credits granted (0 if already granted). */
  async grantTrial(userId: string): Promise<number> {
    if (this.trialCredits <= 0) return 0;
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { trialGrantedAt: true } });
      if (!user || user.trialGrantedAt) return 0;
      const balance = await this.lockBalance(tx, userId);
      await this.record(tx, userId, balance, { type: "trial", amount: this.trialCredits, description: "Free trial credits" });
      await tx.user.update({ where: { id: userId }, data: { trialGrantedAt: new Date() } });
      return this.trialCredits;
    });
  }

  /**
   * Locks the user's row and checks the balance. Call this FIRST inside a transaction that will
   * later insert rows referencing the user: inserting first takes a shared lock on the user row,
   * and two concurrent requests upgrading to FOR UPDATE afterwards would deadlock.
   */
  async ensureBalance(tx: Tx, userId: string, amount: number): Promise<number> {
    const balance = await this.lockBalance(tx, userId);
    if (balance < amount) throw new InsufficientCreditsError(amount, balance);
    return balance;
  }

  /**
   * Reserves credits for a generation inside the caller's transaction (the generation row must
   * already exist and `ensureBalance` must have been called first). Throws InsufficientCreditsError.
   */
  async hold(tx: Tx, userId: string, generationId: string, amount: number, description: string): Promise<void> {
    if (amount <= 0) return;
    const balance = await this.lockBalance(tx, userId);
    if (balance < amount) throw new InsufficientCreditsError(amount, balance);
    await this.record(tx, userId, balance, { type: "hold", amount: -amount, generationId, description });
    await tx.bannerGeneration.update({ where: { id: generationId }, data: { creditsHeld: amount } });
  }

  /** Marks the held credits as charged once the job succeeded. */
  async settle(generationId: string): Promise<void> {
    await prisma.$executeRaw`UPDATE banner_generations SET credits_charged = credits_held WHERE id = ${generationId}::uuid AND credits_held > 0`;
  }

  /** Gives the held credits back when a job fails. Idempotent. */
  async release(generationId: string, reason = "Generation failed — credits returned"): Promise<number> {
    return prisma.$transaction(async (tx) => {
      const generation = await tx.bannerGeneration.findUnique({ where: { id: generationId }, select: { userId: true, creditsHeld: true, creditsCharged: true } });
      if (!generation || generation.creditsHeld <= 0 || generation.creditsCharged > 0) return 0;
      const already = await tx.creditTransaction.findFirst({ where: { generationId, type: "release" } });
      if (already) return 0;
      const balance = await this.lockBalance(tx, generation.userId);
      await this.record(tx, generation.userId, balance, { type: "release", amount: generation.creditsHeld, generationId, description: reason });
      await tx.bannerGeneration.update({ where: { id: generationId }, data: { creditsHeld: 0 } });
      return generation.creditsHeld;
    });
  }

  /** Credits a purchase. Idempotent on the Stripe session/event ids (unique constraints). */
  async recordPurchase(input: { userId: string; credits: number; packId: string; currency: string; amountPaid: number; stripeSessionId: string; stripeEventId?: string }): Promise<boolean> {
    try {
      await prisma.$transaction(async (tx) => {
        const balance = await this.lockBalance(tx, input.userId);
        await this.record(tx, input.userId, balance, {
          type: "purchase",
          amount: input.credits,
          packId: input.packId,
          currency: input.currency,
          amountPaid: input.amountPaid,
          stripeSessionId: input.stripeSessionId,
          stripeEventId: input.stripeEventId,
          description: `Purchased ${input.credits} credits (${input.packId})`,
        });
      });
      logger.info({ userId: input.userId, credits: input.credits, packId: input.packId }, "Credits purchased");
      return true;
    } catch (err) {
      // P2002 = unique violation → this session/event was already credited
      if ((err as { code?: string }).code === "P2002") return false;
      throw err;
    }
  }

  async overview(userId: string, limit = 50): Promise<CreditsOverview> {
    const [balance, transactions] = await Promise.all([
      this.getBalance(userId),
      prisma.creditTransaction.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: limit }),
    ]);
    return { balance, costs: this.costs, transactions: transactions.map(toCreditTransactionDto) };
  }

  /** Startup safety net: returns credits held by generations that can never finish. */
  async releaseOrphans(): Promise<number> {
    const stuck = await prisma.bannerGeneration.findMany({ where: { status: "failed", creditsHeld: { gt: 0 }, creditsCharged: 0 }, select: { id: true } });
    let total = 0;
    for (const g of stuck) total += await this.release(g.id, "Interrupted generation — credits returned");
    return total;
  }
}

export const creditsService = new CreditsService();
