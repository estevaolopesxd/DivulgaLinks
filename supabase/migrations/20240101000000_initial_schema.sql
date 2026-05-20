-- ============================================================
-- DivulgaLinks - Initial Schema Migration
-- Generated from Prisma schema for Supabase/PostgreSQL
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');
CREATE TYPE "PlatformType" AS ENUM ('AMAZON', 'MERCADO_LIVRE', 'SHOPEE', 'ALIEXPRESS', 'AWIN', 'MAGALU');
CREATE TYPE "WhatsAppStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'QR_PENDING');
CREATE TYPE "TelegramBotStatus" AS ENUM ('INACTIVE', 'ACTIVE');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED');
CREATE TYPE "DestinationType" AS ENUM ('WHATSAPP_GROUP', 'WHATSAPP_CHANNEL', 'TELEGRAM_GROUP', 'TELEGRAM_CHANNEL');
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CLICKED');

-- ── Tables ───────────────────────────────────────────────────

-- users
CREATE TABLE users (
  id            UUID         NOT NULL DEFAULT uuid_generate_v4(),
  email         TEXT         NOT NULL,
  password      TEXT         NOT NULL,
  name          TEXT         NOT NULL,
  role          "UserRole"   NOT NULL DEFAULT 'USER',
  "isActive"    BOOLEAN      NOT NULL DEFAULT true,
  "lastLoginAt" TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_email_key UNIQUE (email)
);

-- platforms
CREATE TABLE platforms (
  id            UUID           NOT NULL DEFAULT uuid_generate_v4(),
  name          TEXT           NOT NULL,
  type          "PlatformType" NOT NULL,
  "affiliateId" TEXT           NOT NULL,
  "apiKey"      TEXT,
  "apiSecret"   TEXT,
  "isActive"    BOOLEAN        NOT NULL DEFAULT true,
  "displayName" TEXT,
  "isDefault"   BOOLEAN        NOT NULL DEFAULT false,
  config        JSONB,
  "createdAt"   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  CONSTRAINT platforms_pkey PRIMARY KEY (id)
);

-- products
CREATE TABLE products (
  id              UUID        NOT NULL DEFAULT uuid_generate_v4(),
  title           TEXT        NOT NULL,
  description     TEXT,
  price           DOUBLE PRECISION NOT NULL,
  "originalPrice" DOUBLE PRECISION,
  "imageUrl"      TEXT,
  "affiliateUrl"  TEXT        NOT NULL,
  "trackingUrl"   TEXT,
  "platformId"    UUID,
  "externalId"    TEXT,
  category        TEXT,
  tags            TEXT[]      NOT NULL DEFAULT '{}',
  "isActive"      BOOLEAN     NOT NULL DEFAULT true,
  "importedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_platform_id_fkey FOREIGN KEY ("platformId")
    REFERENCES platforms(id) ON DELETE SET NULL
);

-- whatsapp_accounts
CREATE TABLE whatsapp_accounts (
  id            UUID             NOT NULL DEFAULT uuid_generate_v4(),
  name          TEXT             NOT NULL,
  "phoneNumber" TEXT,
  status        "WhatsAppStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "qrCode"      TEXT,
  "createdAt"   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  CONSTRAINT whatsapp_accounts_pkey PRIMARY KEY (id)
);

-- telegram_bots
CREATE TABLE telegram_bots (
  id          UUID                NOT NULL DEFAULT uuid_generate_v4(),
  name        TEXT                NOT NULL,
  token       TEXT                NOT NULL,
  username    TEXT,
  status      "TelegramBotStatus" NOT NULL DEFAULT 'INACTIVE',
  "createdAt" TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

  CONSTRAINT telegram_bots_pkey PRIMARY KEY (id),
  CONSTRAINT telegram_bots_token_key UNIQUE (token)
);

-- campaigns
CREATE TABLE campaigns (
  id                     UUID             NOT NULL DEFAULT uuid_generate_v4(),
  name                   TEXT             NOT NULL,
  description            TEXT,
  status                 "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "messageTemplate"      TEXT             NOT NULL,
  "intervalMinutes"      INTEGER          NOT NULL DEFAULT 60,
  "delayBetweenMessages" INTEGER          NOT NULL DEFAULT 5000,
  "startTime"            TIMESTAMPTZ,
  "endTime"              TIMESTAMPTZ,
  platforms              TEXT[]           NOT NULL DEFAULT '{}',
  "isActive"             BOOLEAN          NOT NULL DEFAULT false,
  "createdById"          UUID,
  "allowedStartTime"     VARCHAR(5),
  "allowedEndTime"       VARCHAR(5),
  "allowedWeekdays"      INTEGER[]        NOT NULL DEFAULT '{}',
  "createdAt"            TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  "updatedAt"            TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  CONSTRAINT campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT campaigns_created_by_id_fkey FOREIGN KEY ("createdById")
    REFERENCES users(id) ON DELETE SET NULL
);

-- campaign_destinations
CREATE TABLE campaign_destinations (
  id                UUID              NOT NULL DEFAULT uuid_generate_v4(),
  "campaignId"      UUID              NOT NULL,
  type              "DestinationType" NOT NULL,
  "destinationId"   TEXT              NOT NULL,
  "destinationName" TEXT              NOT NULL,
  "accountId"       TEXT              NOT NULL,
  "accountType"     TEXT              NOT NULL,
  "isActive"        BOOLEAN           NOT NULL DEFAULT true,

  CONSTRAINT campaign_destinations_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_destinations_campaign_id_fkey FOREIGN KEY ("campaignId")
    REFERENCES campaigns(id) ON DELETE CASCADE
);

-- campaign_products
CREATE TABLE campaign_products (
  id           UUID NOT NULL DEFAULT uuid_generate_v4(),
  "campaignId" UUID NOT NULL,
  "productId"  UUID NOT NULL,

  CONSTRAINT campaign_products_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_products_campaign_id_product_id_key UNIQUE ("campaignId", "productId"),
  CONSTRAINT campaign_products_campaign_id_fkey FOREIGN KEY ("campaignId")
    REFERENCES campaigns(id) ON DELETE CASCADE,
  CONSTRAINT campaign_products_product_id_fkey FOREIGN KEY ("productId")
    REFERENCES products(id) ON DELETE CASCADE
);

-- message_logs
CREATE TABLE message_logs (
  id                TEXT          NOT NULL DEFAULT uuid_generate_v4()::TEXT,
  "campaignId"      UUID          NOT NULL,
  "productId"       UUID,
  "destinationId"   TEXT          NOT NULL,
  "destinationType" TEXT          NOT NULL,
  message           TEXT          NOT NULL,
  status            "MessageStatus" NOT NULL DEFAULT 'PENDING',
  "sentAt"          TIMESTAMPTZ,
  "failedReason"    TEXT,
  "createdAt"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT message_logs_pkey PRIMARY KEY (id),
  CONSTRAINT message_logs_campaign_id_fkey FOREIGN KEY ("campaignId")
    REFERENCES campaigns(id) ON DELETE CASCADE,
  CONSTRAINT message_logs_product_id_fkey FOREIGN KEY ("productId")
    REFERENCES products(id) ON DELETE SET NULL
);

-- click_logs
CREATE TABLE click_logs (
  id             UUID        NOT NULL DEFAULT uuid_generate_v4(),
  "messageLogId" TEXT,
  "productId"    UUID        NOT NULL,
  "shortCode"    TEXT        NOT NULL,
  "ipAddress"    TEXT,
  "userAgent"    TEXT,
  "clickedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT click_logs_pkey PRIMARY KEY (id),
  CONSTRAINT click_logs_product_id_fkey FOREIGN KEY ("productId")
    REFERENCES products(id) ON DELETE RESTRICT
);

-- schedules
CREATE TABLE schedules (
  id               UUID        NOT NULL DEFAULT uuid_generate_v4(),
  "campaignId"     UUID        NOT NULL,
  "cronExpression" TEXT        NOT NULL,
  "isActive"       BOOLEAN     NOT NULL DEFAULT true,
  "lastRunAt"      TIMESTAMPTZ,
  "nextRunAt"      TIMESTAMPTZ,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT schedules_pkey PRIMARY KEY (id),
  CONSTRAINT schedules_campaign_id_fkey FOREIGN KEY ("campaignId")
    REFERENCES campaigns(id) ON DELETE CASCADE
);

-- destination_configs
CREATE TABLE destination_configs (
  id                   UUID              NOT NULL DEFAULT uuid_generate_v4(),
  "destinationId"      TEXT              NOT NULL,
  "destinationType"    "DestinationType" NOT NULL,
  "accountId"          TEXT              NOT NULL,
  "displayName"        TEXT              NOT NULL,
  "allowedStartTime"   TEXT,
  "allowedEndTime"     TEXT,
  "allowedWeekdays"    INTEGER[]         NOT NULL DEFAULT '{}',
  "maxMessagesPerDay"  INTEGER,
  "minIntervalMinutes" INTEGER,
  "allowedPlatformIds" TEXT[]            NOT NULL DEFAULT '{}',
  "customTemplate"     TEXT,
  "isActive"           BOOLEAN           NOT NULL DEFAULT true,
  "createdAt"          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

  CONSTRAINT destination_configs_pkey PRIMARY KEY (id),
  CONSTRAINT destination_configs_destination_id_account_id_key UNIQUE ("destinationId", "accountId")
);

-- destination_daily_stats
CREATE TABLE destination_daily_stats (
  id                    UUID    NOT NULL DEFAULT uuid_generate_v4(),
  "destinationConfigId" UUID    NOT NULL,
  date                  DATE    NOT NULL,
  "messagesSent"        INTEGER NOT NULL DEFAULT 0,
  "messagesFailed"      INTEGER NOT NULL DEFAULT 0,
  clicks                INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT destination_daily_stats_pkey PRIMARY KEY (id),
  CONSTRAINT destination_daily_stats_destination_config_id_date_key UNIQUE ("destinationConfigId", date),
  CONSTRAINT destination_daily_stats_destination_config_id_fkey FOREIGN KEY ("destinationConfigId")
    REFERENCES destination_configs(id) ON DELETE CASCADE
);

-- ── Indexes ──────────────────────────────────────────────────

CREATE INDEX idx_products_platform_id ON products("platformId");
CREATE INDEX idx_products_is_active ON products("isActive");
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_is_active ON campaigns("isActive");
CREATE INDEX idx_message_logs_campaign_id ON message_logs("campaignId");
CREATE INDEX idx_message_logs_status ON message_logs(status);
CREATE INDEX idx_message_logs_created_at ON message_logs("createdAt");
CREATE INDEX idx_click_logs_product_id ON click_logs("productId");
CREATE INDEX idx_click_logs_clicked_at ON click_logs("clickedAt");
CREATE INDEX idx_destination_daily_stats_date ON destination_daily_stats(date);

-- ── updatedAt trigger ────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_platforms_updated_at
  BEFORE UPDATE ON platforms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_accounts_updated_at
  BEFORE UPDATE ON whatsapp_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_telegram_bots_updated_at
  BEFORE UPDATE ON telegram_bots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schedules_updated_at
  BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_destination_configs_updated_at
  BEFORE UPDATE ON destination_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
