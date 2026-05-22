-- AlterTable: add accountIds array to campaign_destinations
-- accountIds stores all WhatsApp/Telegram account IDs that can send to this
-- destination. The dispatch worker picks one at random on each send.
-- Falls back to accountId (primary) when accountIds is empty.

ALTER TABLE "campaign_destinations"
  ADD COLUMN IF NOT EXISTS "accountIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
