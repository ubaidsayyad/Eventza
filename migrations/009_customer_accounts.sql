ALTER TABLE ep_orders ADD COLUMN IF NOT EXISTS customer_user_id TEXT;
CREATE INDEX IF NOT EXISTS ep_orders_customer_user_idx ON ep_orders(customer_user_id);