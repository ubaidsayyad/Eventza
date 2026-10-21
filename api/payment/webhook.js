import { db, config, webhooks, email } from "hatchable";
import { fulfillCapturedPayment } from "lib/fulfill-order.js";
import { releaseOrderInventory } from "lib/inventory.js";
export const access="public";
export const methods=["POST"];
export default async function(req,res){
 const signature=req.headers["x-razorpay-signature"]||"",eventId=req.headers["x-razorpay-event-id"]||"";
 if(!signature||!req.rawBody)return res.status(400).json({error:"Missing webhook signature or raw payload."});
 try{
  let secret="";try{secret=await config.get("RAZORPAY_WEBHOOK_SECRET");}catch(_){}
  if(!secret)return res.status(503).json({error:"Razorpay webhooks are disabled until RAZORPAY_WEBHOOK_SECRET is configured in Hatchable Setup."});
  const verified=await webhooks.verifyHmac({raw:req.rawBody,signature,secret,encoding:"hex"});
  if(!verified)return res.status(400).json({error:"Invalid webhook signature."});
  const payload=req.body||{},eventType=String(payload.event||"unknown"),providerEventId=String(eventId||await (async()=>{const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(req.rawBody));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("");})());
  const exists=await db.query("INSERT INTO ep_payment_webhooks(provider_event_id,event_type,verified,payload) VALUES($1,$2,true,$3::jsonb) ON CONFLICT(provider_event_id) DO NOTHING RETURNING id",[providerEventId,eventType,JSON.stringify({event:eventType})]);
  if(!exists.rows.length){
    const prior=await db.query("SELECT processed_at FROM ep_payment_webhooks WHERE provider_event_id=$1",[providerEventId]);
    if(prior.rows.length&&prior.rows[0].processed_at)return res.json({received:true,duplicate:true});
  }
  const payment=payload.payload&&payload.payload.payment&&payload.payload.payment.entity;
  if(eventType==="payment.captured"&&payment&&payment.order_id&&payment.id){
    await fulfillCapturedPayment({providerOrderId:payment.order_id,paymentId:payment.id,paymentPayload:{status:payment.status,amount:payment.amount,currency:payment.currency},req});
  }else if(eventType==="payment.failed"&&payment&&payment.order_id){
    const p=await db.query("SELECT id,order_id FROM ep_payments WHERE provider_order_id=$1",[payment.order_id]);
    if(p.rows.length){
      const updated=await db.query("UPDATE ep_orders SET order_status='failed',updated_at=now() WHERE id=$1 AND order_status='pending' RETURNING id",[p.rows[0].order_id]);
      if(updated.rows.length){
        await db.query("UPDATE ep_payments SET payment_status='failed',provider_payment_id=COALESCE(provider_payment_id,$1),provider_payload=$2::jsonb,updated_at=now() WHERE id=$3 AND payment_status='pending'",[payment.id||null,JSON.stringify({status:payment.status||"failed",reason:payment.error_description||"Payment failed"}),p.rows[0].id]);
        await releaseOrderInventory(p.rows[0].order_id);
      }
    }
  }else if(eventType==="refund.processed"){
    const refund=payload.payload&&payload.payload.refund&&payload.payload.refund.entity;
    if(refund&&refund.id){
      const refundRow=await db.query("SELECT order_id,payment_id,amount,refund_status FROM ep_refunds WHERE provider_refund_id=$1",[refund.id]);
      if(refundRow.rows.length){
        const orderId=refundRow.rows[0].order_id;
        await db.query("UPDATE ep_refunds SET refund_status='processed',processed_at=COALESCE(processed_at,now()) WHERE provider_refund_id=$1",[refund.id]);
        const changed=await db.query("UPDATE ep_orders SET order_status='refunded',updated_at=now() WHERE id=$1 AND order_status IN ('paid','refunding') RETURNING id",[orderId]);
        if(changed.rows.length){
          await db.query("UPDATE ep_payments SET payment_status='refunded',updated_at=now() WHERE id=$1",[refundRow.rows[0].payment_id]);
          await db.query("UPDATE ep_tickets SET ticket_status='refunded' WHERE order_id=$1 AND ticket_status IN ('valid','checked_in')",[orderId]);
          await releaseOrderInventory(orderId);
          await db.query("INSERT INTO ep_audit_logs(actor_id,action,target_type,target_id,details) VALUES('razorpay','refund_processed','order',$1,$2::jsonb)",[orderId,JSON.stringify({provider_refund_id:refund.id,amount:refundRow.rows[0].amount})]);
          const contact=await db.query("SELECT booking_ref,purchaser_name,purchaser_email FROM ep_orders WHERE id=$1",[orderId]);
          if(contact.rows.length){let sent=false,msgId=null,error=null;try{const m=await email.send({to:contact.rows[0].purchaser_email,subject:"Refund processed — Eventza "+contact.rows[0].booking_ref,text:"Your refund was confirmed by the payment provider. Booking "+contact.rows[0].booking_ref+". Refunded tickets cannot be used for entry.",html:"<p>Your refund was confirmed by the payment provider.</p><p>Booking reference: <strong>"+contact.rows[0].booking_ref+"</strong></p><p>Refunded tickets cannot be used for entry.</p>"});sent=!!m.success;msgId=m.message_id||m.ses_message_id||null;if(!sent)error="Provider did not confirm sending."}catch(e){error=String(e);console.log("refund_email_error",error)}await db.query("INSERT INTO ep_email_deliveries(order_id,recipient_email,email_type,delivery_status,provider_message_id,error_message,attempts,last_attempt_at) VALUES($1,$2,'refund_processed',$3,$4,$5,1,now())",[orderId,contact.rows[0].purchaser_email,sent?"sent":"failed",msgId,error]);}
        }
      }
    }
  }
  await db.query("UPDATE ep_payment_webhooks SET processed_at=now(),processing_error=NULL WHERE provider_event_id=$1",[providerEventId]);
  return res.json({received:true,processed:true});
 }catch(e){console.log("razorpay_webhook_error",String(e));return res.status(503).json({error:"Webhook was verified but processing failed. Razorpay should retry this notification."});}
}