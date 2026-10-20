import { db } from "hatchable";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 try{
  const [orders,tickets,rev,checkins,emails,events,pending]=await Promise.all([
   db.query("SELECT COUNT(*)::int AS total_orders,COUNT(*) FILTER(WHERE order_status='paid')::int AS paid_orders,COUNT(*) FILTER(WHERE order_status='pending')::int AS pending_payments,COUNT(*) FILTER(WHERE order_status='cancelled')::int AS cancellations,COUNT(*) FILTER(WHERE order_status IN ('refunded','partially_refunded'))::int AS refunds FROM ep_orders"),
   db.query("SELECT COUNT(*)::int AS tickets_sold,COUNT(*) FILTER(WHERE ticket_status='valid')::int AS tickets_remaining,COUNT(*) FILTER(WHERE ticket_status='checked_in')::int AS checked_in FROM ep_tickets tk JOIN ep_orders o ON o.id=tk.order_id WHERE o.order_status='paid'"),
   db.query("SELECT COALESCE(SUM(CASE WHEN payment_status IN ('paid','refunded','partially_refunded') THEN amount ELSE 0 END),0)::numeric(12,2) AS gross_revenue FROM ep_payments"),
   db.query("SELECT COUNT(*)::int AS count FROM ep_checkins"),
   db.query("SELECT COUNT(*)::int AS email_failures FROM ep_email_deliveries WHERE delivery_status='failed'"),
   db.query("SELECT COUNT(*)::int AS total_events,COUNT(*) FILTER(WHERE event_status='published')::int AS published_events FROM ep_events"),
   db.query("SELECT tt.name,COUNT(tk.id)::int AS count FROM ep_ticket_types tt LEFT JOIN ep_tickets tk ON tk.ticket_type_id=tt.id LEFT JOIN ep_orders o ON o.id=tk.order_id AND o.order_status='paid' GROUP BY tt.name ORDER BY count DESC LIMIT 10")
  ]);
  const byEvent=await db.query("SELECT e.id,e.name,e.event_date::text,e.event_status,e.is_sample,COUNT(tk.id) FILTER(WHERE o.order_status='paid')::int AS sold,COUNT(ci.id)::int AS checked_in FROM ep_events e LEFT JOIN ep_tickets tk ON tk.event_id=e.id LEFT JOIN ep_orders o ON o.id=tk.order_id LEFT JOIN ep_checkins ci ON ci.ticket_id=tk.id GROUP BY e.id ORDER BY e.event_date LIMIT 30");
  return res.json({overview:{...orders.rows[0],...tickets.rows[0],...rev.rows[0],...checkins.rows[0],...emails.rows[0],...events.rows[0]},tickets_by_category:pending.rows,events:byEvent.rows});
 }catch(e){console.log("admin_overview_error",String(e));return res.status(500).json({error:"Could not load dashboard overview."});}
}