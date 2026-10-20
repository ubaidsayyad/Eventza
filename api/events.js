import { db } from "hatchable";
export const access = "public";
export const methods = ["GET"];
export default async function(req,res){
  try {
    if(req.query && req.query.id){
      const e=await db.query("SELECT id,name,slug,category,short_description,description,banner_url,venue,address,city,event_date::text,start_time::text,end_time::text,total_capacity,event_status,is_sample,attendee_names_required,attendee_emails_allowed,age_restriction,entry_instructions,cancellation_policy FROM ep_events WHERE id=$1 AND event_status='published' AND event_date >= CURRENT_DATE",[req.query.id]);
      if(!e.rows.length)return res.status(404).json({error:"Event not found or no longer available."});
      const t=await db.query("SELECT id,name,description,price,booking_fee,capacity-sold_count AS available_quantity,per_order_limit,sales_start,sales_end FROM ep_ticket_types WHERE event_id=$1 ORDER BY price ASC",[req.query.id]);
      return res.json({event:{...e.rows[0],ticket_types:t.rows}});
    }
    const r=await db.query("SELECT e.id,e.name,e.slug,e.category,e.short_description,e.description,e.venue,e.city,e.event_date::text,e.start_time::text,e.end_time::text,e.is_sample,COALESCE(MIN(t.price),0) AS starting_price FROM ep_events e LEFT JOIN ep_ticket_types t ON t.event_id=e.id AND t.capacity>t.sold_count WHERE e.event_status='published' AND e.event_date>=CURRENT_DATE GROUP BY e.id ORDER BY e.event_date,e.start_time LIMIT 100");
    return res.json({events:r.rows});
  } catch(e){ console.log("events_error",String(e)); return res.status(500).json({error:"Events are temporarily unavailable."});}
}