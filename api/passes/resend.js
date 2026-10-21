import { db, email } from "hatchable";
import { sha256, secureToken, escapeHtml } from "lib/crypto.js";
export const access="public";
export const methods=["POST"];
export default async function(req,res){
 const b=req.body||{},ref=String(b.booking_ref||""),accessToken=String(b.order_token||"");
 if(!ref||accessToken.length<40)return res.status(400).json({error:"Booking reference and original access token are required."});
 try{
  const found=await db.query("SELECT id,booking_ref,order_status,access_token_hash,purchaser_email FROM ep_orders WHERE booking_ref=$1",[ref]);
  if(!found.rows.length||found.rows[0].access_token_hash!==await sha256(accessToken))return res.status(404).json({error:"Booking or access token not found."});
  const o=found.rows[0];if(o.order_status!=="paid")return res.status(409).json({error:"Passes are available only after verified payment. Current status: "+o.order_status+"."});
  const tickets=await db.query("SELECT tk.id,tk.ticket_no,tk.ticket_status,tk.attendee_name,tk.attendee_email,e.name AS event_name,e.event_date::text,e.start_time::text,e.venue,tt.name AS ticket_name FROM ep_tickets tk JOIN ep_events e ON e.id=tk.event_id JOIN ep_ticket_types tt ON tt.id=tk.ticket_type_id WHERE tk.order_id=$1 ORDER BY tk.created_at",[o.id]);
  if(!tickets.rows.length)return res.status(409).json({error:"No tickets have been issued for this order yet. Check payment status in a moment."});
  const base=(req.headers["x-forwarded-proto"]||"https")+"://"+(req.headers.host||"eventpass.hatchable.site"),passes=[];
  for(const t of tickets.rows){
   if(["cancelled","refunded","invalid"].includes(t.ticket_status)){passes.push({...t,pass_url:null});continue;}
   const token=secureToken(),hash=await sha256(token);
   await db.query("UPDATE ep_tickets SET qr_token_hash=$1 WHERE id=$2",[hash,t.id]);
   const url=base+"/pass.html?token="+encodeURIComponent(token);
   let sent=false,error=null,msgId=null;
   try{const m=await email.send({to:t.attendee_email||o.purchaser_email,subject:"Your Eventza pass — "+t.event_name,text:"Your Eventza pass: "+url+"\nTicket "+t.ticket_no+" — "+t.event_name,html:"<p>Your Eventza pass is ready.</p><h2>"+escapeHtml(t.event_name)+"</h2><p>"+escapeHtml(t.ticket_name)+" · "+escapeHtml(t.ticket_no)+"</p><p><a href='"+url+"'>Open QR pass / print as PDF</a></p>"});sent=!!m.success;msgId=m.message_id||m.ses_message_id||null;if(!sent)error="Provider did not confirm sending.";}catch(e){error=String(e);}
   await db.query("INSERT INTO ep_email_deliveries(order_id,ticket_id,recipient_email,email_type,delivery_status,provider_message_id,error_message,attempts,last_attempt_at) VALUES($1,$2,$3,'ticket_pass_resend',$4,$5,$6,1,now())",[o.id,t.id,t.attendee_email||o.purchaser_email,sent?"sent":"failed",msgId,error]);
   passes.push({...t,pass_url:url,token,email_status:sent?"sent":"failed"});
  }
  return res.json({ok:true,booking_ref:ref,passes,message:"Pass links refreshed. This replaces previous QR tokens for the same tickets."});
 }catch(e){console.log("pass_resend_error",String(e));return res.status(503).json({error:"Passes could not be refreshed. Try again or contact support."});}
}