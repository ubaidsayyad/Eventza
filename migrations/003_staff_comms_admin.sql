CREATE TABLE IF NOT EXISTS ep_staff_assignments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 staff_email TEXT NOT NULL,
 staff_id TEXT,
 event_id UUID NOT NULL REFERENCES ep_events(id),
 enabled BOOLEAN NOT NULL DEFAULT true,
 invited_by TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(staff_email,event_id)
);
CREATE INDEX IF NOT EXISTS ep_staff_email_idx ON ep_staff_assignments(lower(staff_email));
CREATE TABLE IF NOT EXISTS ep_email_deliveries (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id UUID REFERENCES ep_orders(id),
 ticket_id UUID REFERENCES ep_tickets(id),
 recipient_email TEXT NOT NULL,
 email_type TEXT NOT NULL,
 delivery_status TEXT NOT NULL DEFAULT 'queued' CHECK(delivery_status IN ('queued','sent','failed')),
 provider_message_id TEXT,
 error_message TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,
 last_attempt_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ep_refunds (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id UUID NOT NULL REFERENCES ep_orders(id),
 payment_id UUID REFERENCES ep_payments(id),
 provider_refund_id TEXT UNIQUE,
 amount NUMERIC(12,2) NOT NULL CHECK(amount >= 0),
 refund_status TEXT NOT NULL DEFAULT 'pending' CHECK(refund_status IN ('pending','processed','failed')),
 reason TEXT NOT NULL DEFAULT '',
 processed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ep_cancellations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id UUID REFERENCES ep_orders(id),
 ticket_id UUID REFERENCES ep_tickets(id),
 reason TEXT NOT NULL DEFAULT '',
 cancelled_by TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ep_audit_logs (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id TEXT NOT NULL,
 actor_email TEXT NOT NULL DEFAULT '',
 action TEXT NOT NULL,
 target_type TEXT NOT NULL,
 target_id TEXT NOT NULL DEFAULT '',
 details JSONB NOT NULL DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ep_support_messages (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 full_name TEXT NOT NULL,
 email TEXT NOT NULL,
 subject TEXT NOT NULL,
 message TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'new',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ep_site_settings (
 setting_key TEXT PRIMARY KEY,
 setting_value JSONB NOT NULL,
 updated_by TEXT,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ep_email_status_idx ON ep_email_deliveries(delivery_status,created_at DESC);