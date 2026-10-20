import { db } from "hatchable";
export const access="admin";
export const methods=["GET","POST","PUT"];
export default async function(req,res){
 try{
  if(req.method==="GET"){
   const r=await db.query("SELECT e.*,e.event_date::text,COALESCE(json_agg(json_build_object('id',t.id,'name',t.name,'price',t.price,'booking_fee',t.booking_fee,'capacity',t.capacity,'sold_count',t.sold_count,'available_quantity',t.capacity-t.sold_count)) FILTER(WHERE t.id IS NOT NULL),'[]'::json) AS ticket_types FROM ep_events e LEFT JOIN ep_ticket_types t ON t.event_id=e.id GROUP BY e.id ORDER BY e.event_date DESC");
   return res.json({events:r.rows});
  }
  const b=req.body||{},actor=req.member;
  if(req.method==="POST"){
   const name=String(b.name||"").trim(),date=String(b.event_date||""),venue=String(b.venue||"").trim(),city=String(b.city||"").trim(),category=String(b.category||"community"),start=String(b.start_time||"18:00"),end=String(b.end_time||"21:00");
   const typeName=String(b.ticket_name||"General Admission").trim(),price=Number(b.price),fee=Number(b.booking_fee||0),capacity=Number(b.capacity);
   if(name.length<3||name.length>180||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||!venue||venue.length>180||!city||!typeName||!Number.isFinite(price)||price<0||!Number.isFinite(fee)||fee<0||!Number.isInteger(capacity)||capacity<1||capacity>100000)return res.status(400).json({error:"Complete event details and a valid first ticket category."});
   const slug=String(b.slug||name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")).slice(0,160);
   const id=crypto.randomUUID(),ticketId=crypto.randomUUID();
   await db.transaction([
    {sql:"INSERT INTO ep_events(id,name,slug,category,short_description,description,venue,address,city,event_date,start_time,end_time,total_capacity,event_status,is_sample,attendee_names_required,attendee_emails_allowed,age_restriction,entry_instructions,cancellation_policy,terms,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft',false,$14,$15,$16,$17,$18,$19,$20) RETURNING id",params:[id,name,slug,category,String(b.short_description||"").slice(0,500),String(b.description||""),venue,String(b.address||"").slice(0,240),city,date,start,end,capacity,!!b.attendee_names_required,!!b.attendee_emails_allowed,String(b.age_restriction||"All ages").slice(0,100),String(b.entry_instructions||"Show your QR pass at entry."),String(b.cancellation_policy||"Subject to organizer policy."),String(b.terms||""),actor.id]},
    {sql:"INSERT INTO ep_ticket_types(id,event_id,name,description,price,booking_fee,capacity,per_order_limit,sales_start,sales_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",params:[ticketId,id,typeName,String(b.ticket_description||""),price,fee,capacity,Math.min(10,Math.max(1,Number(b.per_order_limit)||10)),b.sales_start||null,b.sales_end||null]},
    {sql:"INSERT INTO ep_audit_logs(actor_id,actor_email,action,target_type,target_id,details) VALUES($1,$2,'event_created','event',$3,$4::jsonb)",params:[actor.id,actor.email||"",id,JSON.stringify({name,slug})]}
   ]);
   return res.status(201).json({ok:true,event_id:id,slug,status:"draft",message:"Event created as draft. Review details then publish it."});
  }
  const id=String(b.id||"");if(!id)return res.status(400).json({error:"Event ID is required."});
  const allowed=["draft","published","unpublished","archived"];if(b.event_status&&!allowed.includes(b.event_status))return res.status(400).json({error:"Invalid event status."});
  await db.query("UPDATE ep_events SET name=COALESCE($1,name),description=COALESCE($2,description),short_description=COALESCE($3,short_description),venue=COALESCE($4,venue),address=COALESCE($5,address),city=COALESCE($6,city),event_status=COALESCE($7,event_status),event_date=COALESCE($8::date,event_date),start_time=COALESCE($9::time,start_time),end_time=COALESCE($10::time,end_time),total_capacity=COALESCE($11,total_capacity),updated_at=now() WHERE id=$12",[b.name||null,b.description??null,b.short_description??null,b.venue??null,b.address??null,b.city??null,b.event_status||null,b.event_date||null,b.start_time||null,b.end_time||null,b.total_capacity===undefined?null:Number(b.total_capacity),id]);
  await db.query("INSERT INTO ep_audit_logs(actor_id,actor_email,action,target_type,target_id,details) VALUES($1,$2,'event_updated','event',$3,$4::jsonb)",[actor.id,actor.email||"",id,JSON.stringify({event_status:b.event_status||null})]);
  return res.json({ok:true,message:"Event updated."});
 }catch(e){console.log("admin_events_error",String(e));return res.status(500).json({error:"Could not save event. The event name/slug may already be in use."});}
}