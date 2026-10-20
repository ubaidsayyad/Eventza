import { db, email } from "hatchable";
import { sha256, secureToken, escapeHtml } from "lib/crypto.js";
import { releaseOrderInventory } from "lib/inventory.js";
function siteBase(req){const proto=req.headers["x-forwarded-proto"]||"https";const host=req.headers.host||"eventpass.hatchable.site";return proto+"://"+host;}
export async function fulfillCapturedPayment({providerOrderId,paymentId,paymentPayload,req}){
 const found=await db.query("SELECT p.id AS payment_row_id,p.order_id,p.amount,p.provider_order_id,o.booking_ref,o.order_status,o.expires_at,o.purchaser_name,o.purchaser_email,o.purchaser_phone FROM ep_payments p JOIN ep_orders o ON o.id=p.order_id WHERE p.provider_order_id=$1",[providerOrderId]);
 if(!found.rows.length)throw new Error("No EventPass order matches this payment.");
 const o=found.rows[0];
 if(o.order_status==="paid"){
  await db.query("UPDATE ep_payments SET provider_payment_id=COALESCE(provider_payment_id,$1),payment_status='paid',signature_verified=true,provider_payload=$2::jsonb,updated_at=now() WHERE id=$3",[paymentId,JSON.stringify(paymentPayload||{}),o.payment_row_id]);
  return {already_paid:true,booking_ref:o.booking_ref};
 }
 if(o.order_status!=="pending")throw new Error("Order is not awaiting payment; current state is "+o.order_status+".");
 if(o.expires_at&&new Date(o.expires_at).getTime()<Date.now()){
  const expired=await db.query("UPDATE ep_orders SET order_status='cancelled',updated_at=now() WHERE id=$1 AND order_status='pending' RETURNING id",[o.order_id]);
  if(expired.rows.length){await db.query("UPDATE ep_payments SET payment_status='cancelled',updated_at=now() WHERE id=$1 AND payment_status='pending'",[o.payment_row_id]);await releaseOrderInventory(o.order_id);}
  throw new Error("Order has expired; payment cannot issue tickets.");
 }
 const items=await db.query("SELECT oi.id,oi.event_id,oi.ticket_type_id,oi.quantity,oi.attendees,e.name AS event_name,e.event_date::text,e.start_time::text,e.venue,t.name AS ticket_name FROM ep_order_items oi JOIN ep_events e ON e.id=oi.event_id JOIN ep_ticket_types t ON t.id=oi.ticket_type_id WHERE oi.order_id=$1 ORDER BY oi.created_at",[o.order_id]);
 const toCreate=[];
 for(const item of items.rows){
  let attendees=[];try{attendees=Array.isArray(item.attendees)?item.attendees:JSON.parse(item.attendees||"[]");}catch(_){}
  for(let i=0;i<Number(item.quantity);i++){
   const at=attendees[i]||{};
   toCreate.push({itemId:item.id,eventId:item.event_id,typeId:item.ticket_type_id,eventName:item.event_name,eventDate:item.event_date,startTime:item.start_time,venue:item.venue,ticketName:item.ticket_name,attendeeName:at.name||o.purchaser_name,attendeeEmail:at.email||o.purchaser_email});
  }
 }
 const ticketData=toCreate.map(t=>({...t,token:secureToken(),ticketNo:"EP-"+crypto.randomUUID().slice(0,8).toUpperCase()}));
 const statements=[
  {sql:"UPDATE ep_orders SET order_status='paid',paid_at=COALESCE(paid_at,now()),updated_at=now() WHERE id=$1 AND order_status='pending' RETURNING id",params:[o.order_id]},
  {sql:"UPDATE ep_payments SET provider_payment_id=$1,payment_status='paid',signature_verified=true,provider_payload=$2::jsonb,updated_at=now() WHERE id=$3 AND EXISTS(SELECT 1 FROM ep_orders WHERE id=$4 AND order_status='paid')",params:[paymentId,JSON.stringify(paymentPayload||{}),o.payment_row_id,o.order_id]}
 ];
 for(let i=0;i<ticketData.length;i++){
  const t=ticketData[i];
  statements.push({sql:"INSERT INTO ep_tickets(ticket_no,order_id,order_item_id,event_id,ticket_type_id,ticket_index,attendee_name,attendee_email,qr_token_hash,ticket_status) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,'valid' WHERE EXISTS(SELECT 1 FROM ep_orders WHERE id=$2 AND order_status='paid') AND NOT EXISTS(SELECT 1 FROM ep_tickets WHERE order_item_id=$3 AND ticket_index=$6) RETURNING id,ticket_no",params:[t.ticketNo,o.order_id,t.itemId,t.eventId,t.typeId,(ticketData.filter(x=>x.itemId===t.itemId).indexOf(t)+1),t.attendeeName,t.attendeeEmail,await sha256(t.token)]});
 }
 const tr=await db.transaction(statements);
 if(!tr.results[0].rowCount)return {already_paid:true,booking_ref:o.booking_ref};
 const generated=[];
 for(let i=0;i<ticketData.length;i++){const row=tr.results[i+2]?.rows?.[0];if(row)generated.push({...ticketData[i],id:row.id,ticketNo:row.ticket_no});}
 const base=siteBase(req);
 await db.query("INSERT INTO ep_audit_logs(actor_id,actor_email,action,target_type,target_id,details) VALUES($1,$2,'payment_confirmed','order',$3,$4::jsonb)",["razorpay",o.purchaser_email,o.order_id,JSON.stringify({booking_ref:o.booking_ref,payment_id:paymentId,tickets:generated.length})]);
 for(const t of generated){
  const token=t.token,url=base+"/pass.html?token="+encodeURIComponent(token);
  const html="<p>Hi "+escapeHtml(t.attendeeName)+",</p><p>Your EventPass ticket is confirmed.</p><h2>"+escapeHtml(t.eventName)+"</h2><p>"+escapeHtml(t.eventDate)+" · "+escapeHtml(t.startTime)+" · "+escapeHtml(t.venue)+"</p><p>Ticket: "+escapeHtml(t.ticketName)+" · "+escapeHtml(t.ticketNo)+"</p><p>Booking reference: "+escapeHtml(o.booking_ref)+"</p><p><a href='"+url+"'>Open your unique QR pass / print as PDF</a></p><p>Present this pass at the gate. Each ticket can be used once.</p>";
  let sent=false,msgId=null,error=null;
  try{const mail=await email.send({to:t.attendeeEmail,subject:"Your EventPass ticket — "+t.eventName,text:"Your ticket is confirmed. Event: "+t.eventName+"; date: "+t.eventDate+"; venue: "+t.venue+"; booking reference: "+o.booking_ref+". Open your pass: "+url,html});sent=!!mail.success;msgId=mail.message_id||mail.ses_message_id||null;if(!sent)error="Email provider did not confirm sending.";}catch(e){error=String(e);console.log("ticket_email_error",error);}
  await db.query("INSERT INTO ep_email_deliveries(order_id,ticket_id,recipient_email,email_type,delivery_status,provider_message_id,error_message,attempts,last_attempt_at) VALUES($1,$2,$3,'ticket_pass',$4,$5,$6,1,now())",[o.order_id,generated.find(x=>x.ticketNo===t.ticketNo)?.id||null,t.attendeeEmail,sent?"sent":"failed",msgId,error]);
 }
 return {already_paid:false,booking_ref:o.booking_ref,tickets:generated.length,email_attempted:generated.length};
}