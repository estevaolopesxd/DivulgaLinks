-- ============================================================
-- DivulgaLinks - Row Level Security Policies
-- ============================================================
-- The backend accesses the database using the service_role key,
-- which bypasses RLS by default. These policies also explicitly
-- grant full access so behaviour is consistent if anon is ever used.

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE click_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE destination_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE destination_daily_stats ENABLE ROW LEVEL SECURITY;

-- Service role full access policies
-- (the backend connects via service_role key or DATABASE_URL with postgres superuser)

CREATE POLICY "Service role has full access to users"
  ON users FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to platforms"
  ON platforms FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to products"
  ON products FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to whatsapp_accounts"
  ON whatsapp_accounts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to telegram_bots"
  ON telegram_bots FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to campaigns"
  ON campaigns FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to campaign_destinations"
  ON campaign_destinations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to campaign_products"
  ON campaign_products FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to message_logs"
  ON message_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to click_logs"
  ON click_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to schedules"
  ON schedules FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to destination_configs"
  ON destination_configs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role has full access to destination_daily_stats"
  ON destination_daily_stats FOR ALL TO service_role
  USING (true) WITH CHECK (true);
