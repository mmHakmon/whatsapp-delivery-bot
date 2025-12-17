-- Create payout_requests table for courier payment requests
CREATE TABLE IF NOT EXISTS payout_requests (
  id SERIAL PRIMARY KEY,
  courier_id INTEGER REFERENCES couriers(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL CHECK (amount >= 50),
  payment_method VARCHAR(50) NOT NULL,
  account_info TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  admin_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  processed_by INTEGER REFERENCES users(id)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payout_courier ON payout_requests(courier_id);
CREATE INDEX IF NOT EXISTS idx_payout_status ON payout_requests(status);
CREATE INDEX IF NOT EXISTS idx_payout_created ON payout_requests(created_at DESC);

-- Comments
COMMENT ON TABLE payout_requests IS 'Courier payout/withdrawal requests';
COMMENT ON COLUMN payout_requests.payment_method IS 'bit, paybox, bank';
COMMENT ON COLUMN payout_requests.status IS 'pending = waiting for approval, approved = approved awaiting payment, completed = paid, rejected = denied';

-- Grant permissions (if needed)
-- GRANT SELECT, INSERT, UPDATE ON payout_requests TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE payout_requests_id_seq TO your_app_user;

