-- Credits: materialized balance on users, append-only ledger, per-generation holds
CREATE TYPE "CreditTransactionType" AS ENUM ('trial', 'purchase', 'hold', 'release', 'refund', 'adjustment');

ALTER TABLE "users"
  ADD COLUMN "credit_balance" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "trial_granted_at" TIMESTAMP(3),
  ADD COLUMN "stripe_customer_id" TEXT;
CREATE UNIQUE INDEX "users_stripe_customer_id_key" ON "users"("stripe_customer_id");

ALTER TABLE "banner_generations"
  ADD COLUMN "credits_held" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "credits_charged" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "credit_transactions" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "type" "CreditTransactionType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "balance_after" INTEGER NOT NULL,
  "generation_id" UUID,
  "stripe_session_id" TEXT,
  "stripe_event_id" TEXT,
  "pack_id" TEXT,
  "currency" TEXT,
  "amount_paid" INTEGER,
  "description" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "credit_transactions_stripe_session_id_key" ON "credit_transactions"("stripe_session_id");
CREATE UNIQUE INDEX "credit_transactions_stripe_event_id_key" ON "credit_transactions"("stripe_event_id");
CREATE INDEX "credit_transactions_user_id_created_at_idx" ON "credit_transactions"("user_id", "created_at" DESC);
CREATE INDEX "credit_transactions_generation_id_idx" ON "credit_transactions"("generation_id");
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "banner_generations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
