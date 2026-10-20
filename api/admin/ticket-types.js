import { db } from "hatchable";
export const access="admin";
export const methods=["GET","POST","PUT","DELETE"];
export default async function(req,res){
 const b=req.body||{};
 try{
  if(req.method==="GET"){
   const eventId=String(req.query.event_id||"");
   if(!eventId)return res.status(400).json({error:"Event ID is required."});
   const r=await db.query("SELECT id,event_id,name,description,price,booking_fee,capacity,sold_count,capacity-sold_count AS available_quantity,per_order_limit,sales_start,sales_end FROM ep_ticket_types WHERE event_id=$1 ORDER BY price",[eventId]);
   return res.json({ticket_types:r.rows});
  }
  if(req.method==="POST"){
   const eventId=String(b.event_id||""),name=String(b.name||"").trim(),price=Number(b.price),fee=Number(b.booking_fee||0),capacity=Number(b.capacity),limit=Number(b.per_order_limit||10);
   if(!eventId||name.length<2||name.length>100||!Number.isFinite(price)||price<0||!Number.isFinite(fee)||fee<0||!Number.isInteger(capacity)||capacity<1||capacity>100000||!Number.isInteger(limit)||limit<1||limit>10)return res.status(400).json({error:"Enter valid ticket name, price, fee, capacity and per-order limit."});
   const event=await db.query("SELECT id,total_capacity FROM ep_events WHERE id=$1",[eventId]);if(!event.rows.length)return res.status(404).json({error:"Event not found."});
   const r=await db.query("INSERT INTO ep_ticket_types(event_id,name,description,price,booking_fee,capacity,per_order_limit,sales_start,sales_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",[eventId,name,String(b.description||""),price,fee,capacity,limit,b.sales_start||null,b.sales_end||null]);
   await db.query("INSERT INTO ep_audit_logs(actor_id,actor_email,action,target_type,target_id,details) VALUES($1,$2,'ticket_type_created','ticket_type',$3,$4::jsonb)",[String(req.member.id),req.member.email||"",r.rows[0].id,JSON.stringify({event_id:eventId,name})]);
   return res.status(201).json({ok:true,id:r.rows[0].id});
  }
  const id=String(b.id||"");if(!id)return res.status(400).json({error:"Ticket category ID is required."});
  if(req.method==="DELETE"){
   const check=await db.query("SELECT sold_count FROM ep_ticket_types WHERE id=$1",[id]);if(!check.rows.length)return res.status(404).json({error:"Ticket category not found."});
   if(Number(check.rows[0].sold_count)>0)return res.status(409).json({error:"This category has reserved or sold tickets. Set its sales end date or update the capacity instead of deleting it."});
   await db.query("DELETE FROM ep_ticket_types WHERE id=$1",[id]);return res.json({ok:true});
  }
  const check=await db.query("SELECT sold_count FROM ep_ticket_types WHERE id=$1",[id]);if(!check.rows.length)return res.status(404).json({error:"Ticket category not found."});
  const capacity=b.capacity===undefined?null:Number(b.capacity);if(capacity!==null&&(!Number.isInteger(capacity)||capacity<Number(check.rows[0].sold_count)||capacity>100000))return res.status(400).json({error:"Capacity cannot be below already reserved/sold tickets."});
  await db.query("UPDATE ep_ticket_types SET name=COALESCE($1,name),description=COALESCE($2,description),price=COALESCE($3,price),booking_fee=COALESCE($4,booking_fee),capacity=COALESCE($5,capacity),per_order_limit=COALESCE($6,per_order_limit),sales_start=COALESCE($7,sales_start),sales_end=COALESCE($8,sales_end) WHERE id=$9",[b.name||null,b.description??null,b.price===undefined?null:Number(b.price),b.booking_fee===undefined?null:Number(b.booking_fee),capacity,b.per_order_limit===undefined?null:Number(b.per_order_limit),b.sales_start||null,b.sales_end||null,id]);
  return res.json({ok:true});
 }catch(e){console.log("admin_ticket_types_error",String(e));return res.status(500).json({error:"Could not update ticket category. Check whether its name is already used for this event."})}
}