-- ============================================================
-- DivulgaLinks - Seed Data (development only)
-- ============================================================

-- Sample admin user (password: Admin@123 - bcrypt hash)
INSERT INTO users (id, email, password, name, role, "isActive") VALUES
  (uuid_generate_v4(), 'admin@divulgalinks.com', '$2b$10$rQZ8kFsJaXBOiAJp.vKv8eJW1eHnJH5Mq1.zPq5OjS0nQHl8kAiZe', 'Admin', 'ADMIN', true);

-- Sample platforms
INSERT INTO platforms (id, name, type, "affiliateId", "displayName", "isActive", "isDefault") VALUES
  (uuid_generate_v4(), 'Amazon Associates', 'AMAZON', 'meutag-20', 'Amazon Principal', true, true),
  (uuid_generate_v4(), 'Mercado Livre Afiliados', 'MERCADO_LIVRE', 'ML-123456', 'Mercado Livre', true, true),
  (uuid_generate_v4(), 'Shopee Affiliate', 'SHOPEE', 'SHOP-789', 'Shopee', true, false);
