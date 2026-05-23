-- CreateTable: app_settings (key-value store for runtime configuration)
CREATE TABLE IF NOT EXISTS "app_settings" (
    "key"       TEXT NOT NULL,
    "value"     TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);
