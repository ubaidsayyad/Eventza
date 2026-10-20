import { db } from "hatchable";
import { sha256 } from "lib/crypto.js";
export const access="public";
export const methods=["GET"];
export default async function(req,res){
 const token=String(req.query.token||"");if(token.length<40||token.length>100)return res.status(400).json({error:"This pass link is invalid."});
 try{
  const hash=await sha256(token);
  const r=await db.query("SELECT tk.ticket_no,tk.ticket_status,tk.attendee_name,tk.attendee_email,tk.issued_at,o.booking_ref,o.order_status,o.total_amount,o.currency,e.name AS event_name,e.event_date::text,e.start_time::text,e.end_time::text,e.venue,e.address,e.city,tt.name AS ticket_name FROM ep_tickets tk JOIN ep_orders o ON o.id=tk.order_id JOIN ep_events e ON e.id=tk.event_id JOIN ep_ticket_types tt ON tt.id=tk.ticket_type_id WHERE tk.qr_token_hash=$1",[hash]);
  if(!r.rows.length)return res.status(404).json({error:"Pass not found. It may have been replaced or invalidated."});
  return res.json({pass:r.rows[0],qr_token:token,can_enter:r.rows[0].order_status==="paid"&&r.rows[0].ticket_status==="valid"});
 }catch(e){console.log("pass_error",String(e));return res.status(500).json({error:"Could not load this pass."});}
}