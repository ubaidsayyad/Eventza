ALTER TABLE ep_tickets ADD COLUMN IF NOT EXISTS ticket_index INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS ep_ticket_order_item_index_idx ON ep_tickets(order_item_id,ticket_index);
ALTER TABLE ep_order_items ADD COLUMN IF NOT EXISTS attendees JSONB NOT NULL DEFAULT '[]'::jsonb;