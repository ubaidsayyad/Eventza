import { db } from "hatchable";
import { releaseOrderInventory } from "lib/inventory.js";
export const access="scheduler";
export const schedule="0 * * * *";
export default async function(){
 try{
  const expired=await db.query("UPDATE ep_orders SET order_status='cancelled',updated_at=now() WHERE order_status='pending' AND expires_at<now() RETURNING id,booking_ref");
  for(const order of expired.rows){
   await releaseOrderInventory(order.id);
   await db.query("UPDATE ep_payments SET payment_status='cancelled',updated_at=now() WHERE order_id=$1 AND payment_status='pending'",[order.id]);
   await db.query("INSERT INTO ep_audit_logs(actor_id,action,target_type,target_id,details) VALUES('scheduler','expired_booking_cancelled','order',$1,$2::jsonb)",[order.id,JSON.stringify({booking_ref:order.booking_ref})]);
  }
  return {cancelled:expired.rows.length};
 }catch(e){console.log("release_expired_error",String(e));throw e;}
}