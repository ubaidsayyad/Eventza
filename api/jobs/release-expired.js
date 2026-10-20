import { db } from "hatchable";
export const access="scheduler";
export const schedule="0 * * * *";
export default async function(){
 try{
  const expired=await db.query("UPDATE ep_orders SET order_status='cancelled',updated_at=now() WHERE order_status='pending' AND expires_at<now() RETURNING id,booking_ref");
  for(const order of expired.rows){
   const items=await db.query("SELECT ticket_type_id,quantity FROM ep_order_items WHERE order_id=$1",[order.id]);
   for(const item of items.rows)await db.query("UPDATE ep_ticket_types SET sold_count=GREATEST(0,sold_count-$1) WHERE id=$2",[item.quantity,item.ticket_type_id]);
   await db.query("UPDATE ep_payments SET payment_status='cancelled',updated_at=now() WHERE order_id=$1 AND payment_status='pending'",[order.id]);
   await db.query("INSERT INTO ep_audit_logs(actor_id,action,target_type,target_id,details) VALUES('scheduler','expired_booking_cancelled','order',$1,$2::jsonb)",[order.id,JSON.stringify({booking_ref:order.booking_ref})]);
  }
  return {cancelled:expired.rows.length};
 }catch(e){console.log("release_expired_error",String(e));throw e;}
}