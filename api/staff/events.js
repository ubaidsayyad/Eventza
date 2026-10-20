import { db } from "hatchable";
export const access="member";
export const methods=["GET"];
export default async function(req,res){
 const m=req.member;if(!m)return res.status(401).json({error:"Staff sign-in required."});
 try{
  const r=await db.query("SELECT e.id,e.name,e.event_date::text,e.start_time::text,e.venue,COUNT(ci.id) FILTER(WHERE ci.checked_in_at::date=CURRENT_DATE)::int AS checked_in FROM ep_staff_assignments a JOIN ep_events e ON e.id=a.event_id LEFT JOIN ep_tickets tk ON tk.event_id=e.id LEFT JOIN ep_checkins ci ON ci.ticket_id=tk.id WHERE lower(a.staff_email)=lower($1) AND a.enabled=true AND e.event_status='published' GROUP BY e.id ORDER BY e.event_date",[m.email||""]);
  return res.json({events:r.rows,staff:{email:m.email||"",name:m.display_name||m.handle||"Staff"}});
 }catch(e){console.log("staff_events_error",String(e));return res.status(500).json({error:"Could not load assigned events."});}
}