import { db } from "hatchable";
export async function releaseOrderInventory(orderId){
 const found=await db.query("SELECT event_id,ticket_type_id,quantity FROM ep_order_items WHERE order_id=$1",[orderId]);
 const statements=[];
 for(const item of found.rows){
  statements.push({sql:"UPDATE ep_ticket_types SET sold_count=GREATEST(0,sold_count-$1) WHERE id=$2",params:[item.quantity,item.ticket_type_id]});
  statements.push({sql:"UPDATE ep_events SET sold_count=GREATEST(0,sold_count-$1) WHERE id=$2",params:[item.quantity,item.event_id]});
 }
 if(statements.length)await db.transaction(statements);
 return found.rows.length;
}