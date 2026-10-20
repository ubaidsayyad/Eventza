import { db, email } from "hatchable";
import { releaseOrderInventory } from "lib/inventory.js";
export const access="admin";
export const methods=["POST"];
export default async function(req,res){
 const b=req.body||{},ref=String(b.booking_ref||"").trim();
 if(!ref)return res.status(400).json({error:"Booking reference is required."});
 try{
  const o=await db.query("SELECT id,order_status,purchaser_email,purchaser_name FROM ep_orders WHERE booking_ref=$1",[ref]);if(!o.rows.length)return res.status(404).json({error:"Booking not found."});
  if(o.rows[0].order_status==="paid")return res.status(409).json({error:"Paid bookings must be refunded through Razorpay before their tickets can be cancelled."});
  if(o.rows[0].order_status==="refunded"||o.rows[0].order_status==="cancelled")return res.json({ok:true,status:o.rows[0].order_status});
  const updated=await db.query("UPDATE ep_orders SET order_status='cancelled',updated_at=now() WHERE id=$1 AND order_status IN ('pending','failed') RETURNING id",[o.rows[0].id]);
  if(updated.rows.length){
   await releaseOrderInventory(o.rows[0].id);
   await db.query("UPDATE ep_payments SET payment_status='cancelled',updated_at=now() WHERE order_id=$1 AND payment_status IN ('pending','failed')",[o.rows[0].id]);
  }
  await db.query("INSERT INTO ep_audit_logs(actor_id,actor_email,action,target_type,target_id,details) VALUES($1,$2,'booking_cancelled','order',$3,$4::jsonb)",[String(req.member.id),req.member.email||"",o.rows[0].id,JSON.stringify({booking_ref:ref,reason:String(b.reason||"Admin cancellation").slice(0,300)})]);
  let emailStatus="not_sent";let emailError=null;
  if(updated.rows.length){
   try{const mail=await email.send({to:o.rows[0].purchaser_email,subject:"EventPass booking cancelled — "+ref,text:"Your EventPass booking "+ref+" has been cancelled. If a payment was debited, contact EventPass support and share your booking reference.",html:"<p>Your EventPass booking has been cancelled.</p><p>Booking reference: <strong>"+ref+"</strong></p><p>If a payment was debited, contact support with this reference.</p>"});emailStatus=mail.success?"sent":"failed";if(!mail.success)emailError="Provider did not confirm sending."}catch(e){emailStatus="failed";emailError=String(e);console.log("cancel_email_error",emailError)}
   await db.query("INSERT INTO ep_email_deliveries(order_id,recipient_email,email_type,delivery_status,error_message,attempts,last_attempt_at) VALUES($1,$2,'booking_cancelled',$3,$4,1,now())",[o.rows[0].id,o.rows[0].purchaser_email,emailStatus,emailError]);
  }
  return res.json({ok:true,status:"cancelled",email_status:emailStatus,message:"Booking cancelled and its inventory hold released."});
 }catch(e){console.log("admin_cancel_error",String(e));return res.status(500).json({error:"Could not cancel booking."})}
}