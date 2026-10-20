import { db } from "hatchable";
import { sha256 } from "lib/crypto.js";
export const access="public";
export const methods=["GET"];
export default async function(req,res){
 const ref=String(req.query.booking_ref||""),token=String(req.query.token||"");
 if(!ref||!token)return res.status(400).json({error:"Booking reference and access token are required."});
 try{
  const h=await sha256(token),r=await db.query("SELECT id,booking_ref,order_status,total_amount,currency,paid_at,created_at,is_sample FROM ep_orders WHERE booking_ref=$1 AND access_token_hash=$2",[ref,h]);
  if(!r.rows.length)return res.status(404).json({error:"Booking not found. Check your booking reference and access token."});
  const o=r.rows[0];const tickets=await db.query("SELECT tk.id,tk.ticket_no,tk.ticket_status,tk.attendee_name,e.name AS event_name,e.event_date::text,e.start_time::text,e.venue,tt.name AS ticket_name FROM ep_tickets tk JOIN ep_events e ON e.id=tk.event_id JOIN ep_ticket_types tt ON tt.id=tk.ticket_type_id WHERE tk.order_id=$1 ORDER BY tk.created_at",[o.id]);
  const em=await db.query("SELECT delivery_status,recipient_email,email_type,error_message,last_attempt_at FROM ep_email_deliveries WHERE order_id=$1 ORDER BY created_at DESC LIMIT 20",[o.id]);
  return res.json({order:{booking_ref:o.booking_ref,status:o.order_status,total_amount:o.total_amount,currency:o.currency,paid_at:o.paid_at,created_at:o.created_at,is_sample:o.is_sample},tickets:tickets.rows,email_deliveries:em.rows});
 }catch(e){console.log("payment_status_error",String(e));return res.status(500).json({error:"Could not check booking status."});}
}