import { db } from "hatchable";
export const access = "public";
export const methods = ["GET"];
export default async function(req,res){
  try {
    if(req.query && req.query.id){
      const requestedId=String(req.query.id);
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedId)) return res.status(404).json({error:"Event not found or no longer available."});
      const e=await db.query("SELECT id,name,slug,category,short_description,description,banner_url,venue,address,city,event_date::text,start_time::text,end_time::text,total_capacity,event_status,is_sample,attendee_names_required,attendee_emails_allowed,age_restriction,entry_instructions,cancellation_policy FROM ep_events WHERE id=$1 AND event_status='published' AND (event_date > CURRENT_DATE OR (event_date = CURRENT_DATE AND end_time > LOCALTIME))",[requestedId]);
      if(!e.rows.length)return res.status(404).json({error:"Event not found or no longer available."});
      const t=await db.query("SELECT t.id,t.name,t.description,t.price,t.booking_fee,CASE WHEN e.sales_start<=now() AND (e.sales_end IS NULL OR e.sales_end>=now()) AND (t.sales_start IS NULL OR t.sales_start<=now()) AND (t.sales_end IS NULL OR t.sales_end>=now()) THEN GREATEST(0,LEAST(t.capacity-t.sold_count,e.total_capacity-e.sold_count)) ELSE 0 END AS available_quantity,t.per_order_limit,t.sales_start,t.sales_end FROM ep_ticket_types t JOIN ep_events e ON e.id=t.event_id WHERE t.event_id=$1 ORDER BY t.price ASC",[requestedId]);
      return res.json({event:{...e.rows[0],ticket_types:t.rows}});
    }
    const r=await db.query("SELECT e.id,e.name,e.slug,e.category,e.short_description,e.description,e.banner_url,e.venue,e.city,e.event_date::text,e.start_time::text,e.end_time::text,e.is_sample,COALESCE(MIN(t.price) FILTER (WHERE t.capacity>t.sold_count AND e.total_capacity>e.sold_count AND e.sales_start<=now() AND (e.sales_end IS NULL OR e.sales_end>=now()) AND (t.sales_start IS NULL OR t.sales_start<=now()) AND (t.sales_end IS NULL OR t.sales_end>=now())),MIN(t.price),0) AS starting_price FROM ep_events e LEFT JOIN ep_ticket_types t ON t.event_id=e.id WHERE e.event_status='published' AND (e.event_date > CURRENT_DATE OR (e.event_date = CURRENT_DATE AND e.end_time > LOCALTIME)) GROUP BY e.id ORDER BY e.event_date,e.start_time LIMIT 100");
    return res.json({events:r.rows});
  } catch(e){ console.log("events_error",String(e)); return res.status(500).json({error:"Events are temporarily unavailable."});}
}