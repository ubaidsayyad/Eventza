ALTER TABLE ep_orders DROP CONSTRAINT IF EXISTS ep_orders_order_status_check;
ALTER TABLE ep_orders ADD CONSTRAINT ep_orders_order_status_check CHECK (order_status IN ('pending','paid','failed','cancelled','refunding','refunded','partially_refunded'));
ALTER TABLE ep_payments DROP CONSTRAINT IF EXISTS ep_payments_payment_status_check;
ALTER TABLE ep_payments ADD CONSTRAINT ep_payments_payment_status_check CHECK (payment_status IN ('pending','authorized','paid','failed','cancelled','refunding','refunded','partially_refunded'));