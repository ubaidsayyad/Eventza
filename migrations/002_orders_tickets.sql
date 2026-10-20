CREATE TABLE IF NOT EXISTS ep_ticket_types (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id UUID NOT NULL REFERENCES ep_events(id),
 name TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 price NUMERIC(12,2) NOT NULL CHECK(price >= 0),
 booking_fee NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(booking_fee >= 0),
 capacity INTEGER NOT NULL CHECK(capacity >= 0),
 sold_count INTEGER NOT NULL DEFAULT 0 CHECK(sold_count >= 0),
 sales_start TIMESTAMPTZ,
 sales_end TIMESTAMPTZ,
 per_order_limit INTEGER NOT NULL DEFAULT 10 CHECK(per_order_limit > 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(event_id,name)
);
CREATE INDEX IF NOT EXISTS ep_ticket_types_event_idx ON ep_ticket_types(event_id);
CREATE TABLE IF NOT EXISTS ep_orders (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_ref TEXT NOT NULL UNIQUE,
 purchaser_name TEXT NOT NULL,
 purchaser_email TEXT NOT NULL,
 purchaser_phone TEXT NOT NULL,
 subtotal NUMERIC(12,2) NOT NULL CHECK(subtotal >= 0),
 booking_fees NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(booking_fees >= 0),
 discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(discount_amount >= 0),
 total_amount NUMERIC(12,2) NOT NULL CHECK(total_amount >= 0),
 currency CHAR(3) NOT NULL DEFAULT 'INR',
 order_status TEXT NOT NULL DEFAULT 'pending' CHECK(order_status IN ('pending','paid','failed','cancelled','refunded','partially_refunded')),
 is_sample BOOLEAN NOT NULL DEFAULT false,
 access_token_hash TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '15 minutes',
 paid_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ep_orders_email_idx ON ep_orders(lower(purchaser_email));
CREATE INDEX IF NOT EXISTS ep_orders_status_idx ON ep_orders(order_status);
CREATE TABLE IF NOT EXISTS ep_order_items (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id UUID NOT NULL REFERENCES ep_orders(id),
 event_id UUID NOT NULL REFERENCES ep_events(id),
 ticket_type_id UUID NOT NULL REFERENCES ep_ticket_types(id),
 quantity INTEGER NOT NULL CHECK(quantity > 0),
 unit_price NUMERIC(12,2) NOT NULL CHECK(unit_price >= 0),
 unit_fee NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(unit_fee >= 0),
 line_total NUMERIC(12,2) NOT NULL CHECK(line_total >= 0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ep_payments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id UUID NOT NULL REFERENCES ep_orders(id),
 provider TEXT NOT NULL DEFAULT 'razorpay',
 provider_order_id TEXT UNIQUE,
 provider_payment_id TEXT UNIQUE,
 amount NUMERIC(12,2) NOT NULL,
 currency CHAR(3) NOT NULL DEFAULT 'INR',
 payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','authorized','paid','failed','cancelled','refunded','partially_refunded')),
 signature_verified BOOLEAN NOT NULL DEFAULT false,
 provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ep_payment_webhooks (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 provider_event_id TEXT NOT NULL UNIQUE,
 event_type TEXT NOT NULL,
 verified BOOLEAN NOT NULL DEFAULT false,
 processed_at TIMESTAMPTZ,
 processing_error TEXT,
 payload JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ep_tickets (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 ticket_no TEXT NOT NULL UNIQUE,
 order_id UUID NOT NULL REFERENCES ep_orders(id),
 order_item_id UUID NOT NULL REFERENCES ep_order_items(id),
 event_id UUID NOT NULL REFERENCES ep_events(id),
 ticket_type_id UUID NOT NULL REFERENCES ep_ticket_types(id),
 attendee_name TEXT,
 attendee_email TEXT,
 qr_token_hash TEXT NOT NULL UNIQUE,
 ticket_status TEXT NOT NULL DEFAULT 'valid' CHECK(ticket_status IN ('valid','checked_in','cancelled','refunded','invalid')),
 issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ep_tickets_event_idx ON ep_tickets(event_id);
CREATE INDEX IF NOT EXISTS ep_tickets_order_idx ON ep_tickets(order_id);
CREATE TABLE IF NOT EXISTS ep_checkins (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 ticket_id UUID NOT NULL UNIQUE REFERENCES ep_tickets(id),
 event_id UUID NOT NULL REFERENCES ep_events(id),
 staff_id TEXT NOT NULL,
 checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ep_scan_attempts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id UUID,
 ticket_id UUID REFERENCES ep_tickets(id),
 staff_id TEXT NOT NULL,
 result TEXT NOT NULL,
 detail TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ep_scan_event_time_idx ON ep_scan_attempts(event_id,created_at DESC);