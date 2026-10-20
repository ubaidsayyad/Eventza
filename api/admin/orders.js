import { db } from "hatchable";
export const access="admin";
export const methods=["GET"];
export default async function(req,res){
 const q=String(req.query.q||"").trim().slice(0,180);
 try{
  const r=await db.query("SELECT o.id,o.booking_ref,o.purchaser_name,o.purchaser_email,o.purchaser_phone,o.total_amount,o.currency,o.order_status,o.is_sample,o.created_at,o.paid_at,e.name AS event_name,e.event_date::text,oi.quantity,tt.name AS ticket_type,p.provider_payment_id,p.payment_status,(SELECT COALESCE(json_agg(json_build_object('id',tk.id,'ticket_no',tk.ticket_no,'ticket_status',tk.ticket_status)),'[]'::json) FROM ep_tickets tk WHERE tk.order_id=o.id) AS tickets FROM ep_orders o JOIN ep_order_items oi ON oi.order_id=o.id JOIN ep_events e ON e.id=oi.event_id JOIN ep_ticket_types tt ON tt.id=oi.ticket_type_id LEFT JOIN ep_payments p ON p.order_id=o.id WHERE ($1='' OR o.booking_ref ILIKE '%'||$1||'%' OR o.purchaser_email ILIKE '%'||$1||'%' OR o.purchaser_name ILIKE '%'||$1||'%' OR EXISTS(SELECT 1 FROM ep_tickets tk WHERE tk.order_id=o.id AND tk.ticket_no ILIKE '%'||$1||'%')) ORDER BY o.created_at DESC LIMIT 100",[q]);
  return res.json({orders:r.rows});
 }catch(e){console.log("admin_orders_error",String(e));return res.status(500).json({error:"Could not search orders."})}
}