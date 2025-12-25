-- ==========================================
-- PUSH NOTIFICATIONS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_type VARCHAR(20) NOT NULL CHECK (user_type IN ('customer', 'courier')),
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  keys JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_type, user_id);
CREATE INDEX idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

-- Comments
COMMENT ON TABLE push_subscriptions IS 'Stores web push notification subscriptions for customers and couriers';
COMMENT ON COLUMN push_subscriptions.user_type IS 'Type of user: customer or courier';
COMMENT ON COLUMN push_subscriptions.user_id IS 'ID of the customer or courier';
COMMENT ON COLUMN push_subscriptions.endpoint IS 'Unique push notification endpoint URL';
COMMENT ON COLUMN push_subscriptions.keys IS 'Push subscription keys (p256dh and auth)';

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Push subscriptions table created successfully!';
END $$;
