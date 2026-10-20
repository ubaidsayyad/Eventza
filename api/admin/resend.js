import { db, email } from "hatchable";
import { sha256,secureToken,escapeHtml } from "lib/crypto.js";
export const access="admin";
export const methods=["POST"];
export default async function(req,res){
 const id=String((req.body||{}).ticket_id||"");if(!id)return res.status(400).json({error:"Ticket ID is required."});
 try{
  const r=await db.query("SELECT tk.id,tk.ticket_no,tk.ticket_status,o.id AS order_id,o.booking_ref,o.order_status,o.purchaser_email,tk.attendee_email,tk.attendee_name,e.name AS event_name,e.event_date::text,e.venue,tt.name AS ticket_name FROM ep_tickets tk JOIN ep_orders o ON o.id=tk.order_id JOIN ep_events e ON e.id=tk.event_id JOIN ep_ticket_types tt ON tt.id=tk.ticket_type_id WHERE tk.id=$1",[id]);
  if(!r.rows.length)return res.status(404).json({error:"Ticket not found."});const t=r.rows[0];if(t.order_status!=="paid"||["cancelled","refunded","invalid"].includes(t.ticket_status))return res.status(409).json({error:"Only active/checked-in tickets from paid bookings can be resent."});
  const token=secureToken();await db.query("UPDATE ep_tickets SET qr_token_hash=$1 WHERE id=$2",[await sha256(token),id]);
  const url=(req.headers["x-forwarded-proto"]||"https")+"://"+(req.headers.host||"eventpass.hatchable.site")+"/pass.html?token="+encodeURIComponent(token),to=t.attendee_email||t.purchaser_email;
  let sent=false,msgId=null,err=null;try{const m=await email.send({to,subject:"Your EventPass pass — "+t.event_name,text:"Open your EventPass QR pass: "+url+"\nBooking reference: "+t.booking_ref,html:"<p>Here is your refreshed EventPass QR pass.</p><h2>"+escapeHtml(t.event_name)+"</h2><p>"+escapeHtml(t.ticket_name)+" · "+escapeHtml(t.ticket_no)+"</p><p><a href='"+url+"'>Open pass / print as PDF</a></p>"});sent=!!m.success;msgId=m.message_id||m.ses_message_id||null;if(!sent)err="Provider did not confirm sending."}catch(e){err=String(e)}
  await db.query("INSERT INTO ep_email_deliveries(order_id,ticket_id,recipient_email,email_type,delivery_status,provider_message_id,error_message,attempts,last_attempt_at) VALUES($1,$2,$3,'admin_resend',$4,$5,$6,1,now())",[t.order_id,id,to,sent?"sent":"failed",msgId,err]);
  await db.query("INSERT INTO ep_audit_logs(actor_id,actor_email,action,target_type,target_id,details) VALUES($1,$2,'ticket_resent','ticket',$3,$4::jsonb)",[String(req.member.id),req.member.email||"",id,JSON.stringify({recipient:to,email_sent:sent})]);
  return res.json({ok:true,email_status:sent?"sent":"failed",error:err,message:sent?"Pass link sent to "+to:"New pass token generated but email failed. Check delivery status and retry after fixing email configuration."});
 }catch(e){console.log("admin_resend_error",String(e));return res.status(500).json({error:"Could not resend this pass."})}
}