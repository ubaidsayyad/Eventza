import { db } from "hatchable";
export const access="admin";
export const methods=["GET","POST","DELETE"];
export default async function(req,res){
 const actor=req.member,b=req.body||{};
 try{
  if(req.method==="GET"){
   const r=await db.query("SELECT a.id,a.staff_email,a.staff_id,a.event_id,a.enabled,a.created_at,e.name AS event_name,e.event_date::text FROM ep_staff_assignments a JOIN ep_events e ON e.id=a.event_id ORDER BY e.event_date DESC");
   return res.json({assignments:r.rows,notice:"Staff must first be added as a project collaborator in Hatchable Settings. This table only grants Eventza event-level permissions."});
  }
  if(req.method==="POST"){
   const email=String(b.email||"").trim().toLowerCase(),eventId=String(b.event_id||"");
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!eventId)return res.status(400).json({error:"Enter a valid staff email and event."});
   await db.query("INSERT INTO ep_staff_assignments(staff_email,event_id,enabled,invited_by) VALUES($1,$2,true,$3) ON CONFLICT(staff_email,event_id) DO UPDATE SET enabled=true",[email,eventId,String(actor.id)]);
   await db.query("INSERT INTO ep_audit_logs(actor_id,actor_email,action,target_type,target_id,details) VALUES($1,$2,'staff_assigned','staff',$3,$4::jsonb)",[String(actor.id),actor.email||"",email,JSON.stringify({event_id:eventId})]);
   return res.status(201).json({ok:true,message:"Event permission saved. Ensure this person is also a Hatchable project collaborator."});
  }
  const id=String(b.id||"");if(!id)return res.status(400).json({error:"Assignment ID required."});
  await db.query("UPDATE ep_staff_assignments SET enabled=false WHERE id=$1",[id]);
  await db.query("INSERT INTO ep_audit_logs(actor_id,actor_email,action,target_type,target_id,details) VALUES($1,$2,'staff_disabled','staff',$3,'{}'::jsonb)",[String(actor.id),actor.email||"",id]);
  return res.json({ok:true});
 }catch(e){console.log("admin_staff_error",String(e));return res.status(500).json({error:"Could not update staff assignment. Check that the event exists."});}
}