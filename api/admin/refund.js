import { db, config, email } from "hatchable";
import { releaseOrderInventory } from "lib/inventory.js";
export const access="admin";
export const methods=["POST"];
async function completeRefund(orderId,paymentRowId,refundId,actor){
 let tr;
 try{
  tr=await db.transaction([
   {sql:"UPDATE ep_orders SET order_status='refund_completing',updated_at=now() WHERE id=$1 AND order_status='refunding' RETURNING id",params:[orderId]},
   {sql:"SELECT CASE WHEN EXISTS(SELECT 1 FROM ep_orders WHERE id=$1 AND order_status='refund_completing') THEN 1 ELSE 1/0 END AS transition_valid",params:[orderId]},
   {sql:"UPDATE ep_orders SET order_status='refunded',updated_at=now() WHERE id=$1 AND order_status='refund_completing' RETURNING id",params:[orderId]},
   {sql:"UPDATE ep_payments SET payment_status='refunded',updated_at=now() WHERE id=$1 AND payment_status='refunding'",params:[paymentRowId]},
   {sql:"UPDATE ep_tickets SET ticket_status='refunded' WHERE order_id=$1 AND ticket_status IN ('valid','checked_in')",params:[orderId]},
   {sql:"INSERT INTO ep_audit_logs(actor_id,actor_email,action,target_type,target_id,details) VALUES($1,$2,'refund_processed','order',$3,$4::jsonb)",params:[String(actor.id),actor.email||"",orderId,JSON.stringify({refund_id:refundId})]}
  ]);
 }catch(e){
  const state=await db.query("SELECT order_status FROM ep_orders WHERE id=$1",[orderId]);
  if(state.rows[0]?.order_status==="refunded")return false;
  throw e;
 }
 if(!tr.results[0].rowCount)return false;
 await releaseOrderInventory(orderId);
 const recipient=await db.query("SELECT o.booking_ref,o.purchaser_name,o.purchaser_email,(SELECT e.name FROM ep_order_items oi JOIN ep_events e ON e.id=oi.event_id WHERE oi.order_id=o.id ORDER BY oi.created_at LIMIT 1) AS event_name FROM ep_orders o WHERE o.id=$1",[orderId]);
 if(recipient.rows.length){
  const o=recipient.rows[0];let sent=false,msgId=null,error=null;
  try{const m=await email.send({to:o.purchaser_email,subject:"Refund processed — EventPass booking "+o.booking_ref,text:"Hi "+o.purchaser_name+", the provider has confirmed your refund for booking "+o.booking_ref+". Refunded tickets cannot be used for entry.",html:"<p>Hi "+String(o.purchaser_name||"there").replace(/[&<>"]/g,"")+",</p><p>Your refund has been confirmed by the payment provider.</p><p>Booking reference: <strong>"+o.booking_ref+"</strong></p><p>Event: "+String(o.event_name||"your event").replace(/[&<>"]/g,"")+"</p><p>Refunded tickets cannot be used for entry.</p>"});sent=!!m.success;msgId=m.message_id||m.ses_message_id||null;if(!sent)error="Provider did not confirm sending."}catch(e){error=String(e);console.log("refund_email_error",error)}
  await db.query("INSERT INTO ep_email_deliveries(order_id,recipient_email,email_type,delivery_status,provider_message_id,error_message,attempts,last_attempt_at) VALUES($1,$2,'refund_processed',$3,$4,$5,1,now())",[orderId,o.purchaser_email,sent?"sent":"failed",msgId,error]);
 }
 return true;
}
export default async function(req,res){
 const b=req.body||{},ref=String(b.booking_ref||"").trim(),actor=req.member;
 if(!ref)return res.status(400).json({error:"Booking reference is required."});
 try{
  const r=await db.query("SELECT o.id,o.order_status,o.booking_ref,o.purchaser_email,p.id AS payment_row_id,p.provider_payment_id,p.provider_order_id,p.amount,p.payment_status FROM ep_orders o JOIN ep_payments p ON p.order_id=o.id WHERE o.booking_ref=$1 ORDER BY p.created_at DESC LIMIT 1",[ref]);
  if(!r.rows.length)return res.status(404).json({error:"Booking/payment not found."});
  const o=r.rows[0];
  if(o.order_status==="refunded"||o.payment_status==="refunded")return res.json({ok:true,status:"refunded",message:"This booking is already refunded."});
  if(o.order_status==="refunding")return res.status(409).json({error:"A refund is already in progress or awaiting provider confirmation. Check Razorpay before attempting any further refund."});
  if(o.order_status!=="paid"||o.payment_status!=="paid"||!o.provider_payment_id)return res.status(409).json({error:"Only a fully paid booking can be refunded. Pending, failed, and sample orders are not refundable here."});
  if(b.confirm!=="FULL_REFUND")return res.status(400).json({error:"To prevent accidental refunds, confirm by sending confirm: FULL_REFUND. This endpoint supports full-order refunds only."});
  let keyId="",keySecret="";try{keyId=await config.get("RAZORPAY_KEY_ID");keySecret=await config.get("RAZORPAY_KEY_SECRET")}catch(_){}
  if(!keyId||!keySecret||!String(keyId).startsWith("rzp_test_"))return res.status(503).json({error:"Refunds require configured Razorpay TEST credentials. Live refunds are disabled."});
  const locked=await db.query("UPDATE ep_orders SET order_status='refunding',updated_at=now() WHERE id=$1 AND order_status='paid' RETURNING id",[o.id]);
  if(!locked.rows.length)return res.status(409).json({error:"This booking changed while the refund was starting. Reload its status."});
  const paymentLock=await db.query("UPDATE ep_payments SET payment_status='refunding',updated_at=now() WHERE id=$1 AND payment_status='paid' RETURNING id",[o.payment_row_id]);
  if(!paymentLock.rows.length){await db.query("UPDATE ep_orders SET order_status='paid',updated_at=now() WHERE id=$1 AND order_status='refunding'",[o.id]);return res.status(409).json({error:"Payment status changed. Reload the booking before retrying."});}
  let response,data;
  try{
   const auth="Basic "+btoa(keyId+":"+keySecret);
   response=await fetch("https://api.razorpay.com/v1/payments/"+encodeURIComponent(o.provider_payment_id)+"/refund",{method:"POST",headers:{Authorization:auth,"Content-Type":"application/json"},body:JSON.stringify({amount:Math.round(Number(o.amount)*100),notes:{booking_ref:ref,reason:String(b.reason||"Organizer-approved refund").slice(0,200)}})});
   data=await response.json();
  }catch(e){
   console.log("refund_provider_timeout",String(e));
   return res.status(503).json({error:"Razorpay refund outcome is uncertain. The booking is locked as refunding to prevent duplicate refunds. Check Razorpay's dashboard and refund webhooks before changing its status."});
  }
  if(!response.ok||!data.id){
   await db.query("INSERT INTO ep_refunds(order_id,payment_id,amount,refund_status,reason) VALUES($1,$2,$3,'failed',$4)",[o.id,o.payment_row_id,o.amount,String(data.error&&data.error.description||"Razorpay refused refund").slice(0,500)]);
   await db.query("UPDATE ep_payments SET payment_status='paid',updated_at=now() WHERE id=$1 AND payment_status='refunding'",[o.payment_row_id]);
   await db.query("UPDATE ep_orders SET order_status='paid',updated_at=now() WHERE id=$1 AND order_status='refunding'",[o.id]);
   return res.status(502).json({error:"Razorpay rejected the refund request. Ticket and payment statuses remain paid/active."});
  }
  const normalizedStatus=data.status==="processed"?"processed":data.status==="failed"?"failed":"pending";
  await db.query("INSERT INTO ep_refunds(order_id,payment_id,provider_refund_id,amount,refund_status,reason,processed_at) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $5='processed' THEN now() ELSE NULL END) ON CONFLICT(provider_refund_id) DO NOTHING",[o.id,o.payment_row_id,data.id,Number(data.amount)/100,normalizedStatus,String(b.reason||"Organizer-approved full refund").slice(0,500)]);
  if(normalizedStatus==="processed")await completeRefund(o.id,o.payment_row_id,data.id,actor);
  if(normalizedStatus==="failed"){await db.query("UPDATE ep_payments SET payment_status='paid',updated_at=now() WHERE id=$1 AND payment_status='refunding'",[o.payment_row_id]);await db.query("UPDATE ep_orders SET order_status='paid',updated_at=now() WHERE id=$1 AND order_status='refunding'",[o.id]);}
  await db.query("INSERT INTO ep_audit_logs(actor_id,actor_email,action,target_type,target_id,details) VALUES($1,$2,'refund_requested','order',$3,$4::jsonb)",[String(actor.id),actor.email||"",o.id,JSON.stringify({provider_refund_id:data.id,status:normalizedStatus})]);
  return res.json({ok:normalizedStatus!=="failed",status:normalizedStatus,refund_id:data.id,message:normalizedStatus==="processed"?"Razorpay confirms the refund. Tickets are now marked refunded.":normalizedStatus==="failed"?"Razorpay reports the refund failed; the original tickets remain active.":"Refund requested. Ticket entry is blocked until Razorpay confirms the refund result."});
 }catch(e){console.log("admin_refund_error",String(e));return res.status(503).json({error:"Refund status could not be reconciled automatically. Check Razorpay before retrying to avoid duplicate refunds."})}
}