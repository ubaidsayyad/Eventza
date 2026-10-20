import { db } from "hatchable";
import { sha256 } from "lib/crypto.js";
export const access="member";
export const methods=["POST"];
export default async function(req,res){
 const m=req.member;if(!m)return res.status(401).json({error:"Staff sign-in required."});
 const b=req.body||{},eventId=String(b.event_id||""),token=String(b.ticket_token||"");
 if(!eventId||token.length<40||token.length>100)return res.status(400).json({result:"invalid",status:"INVALID TICKET",message:"Ticket code is malformed."});
 try{
  const a=await db.query("SELECT id FROM ep_staff_assignments WHERE lower(staff_email)=lower($1) AND event_id=$2 AND enabled=true",[m.email||"",eventId]);
  if(!a.rows.length)return res.status(403).json({error:"You are not assigned to scan tickets for this event."});
  const h=await sha256(token),q=await db.query("SELECT tk.id,tk.ticket_no,tk.ticket_status,tk.attendee_name,tt.name AS ticket_type,o.order_status,e.id AS actual_event_id,e.name AS event_name,ci.checked_in_at,ci.staff_id AS checked_in_by FROM ep_tickets tk JOIN ep_orders o ON o.id=tk.order_id JOIN ep_events e ON e.id=tk.event_id JOIN ep_ticket_types tt ON tt.id=tk.ticket_type_id LEFT JOIN ep_checkins ci ON ci.ticket_id=tk.id WHERE tk.qr_token_hash=$1",[h]);
  if(!q.rows.length){await db.query("INSERT INTO ep_scan_attempts(event_id,staff_id,result,detail) VALUES($1,$2,'invalid','Token not found')",[eventId,String(m.id)]);return res.json({result:"invalid",status:"INVALID TICKET",message:"This QR token does not match any ticket."});}
  const t=q.rows[0];
  if(t.actual_event_id!==eventId){await db.query("INSERT INTO ep_scan_attempts(event_id,ticket_id,staff_id,result,detail) VALUES($1,$2,$3,'wrong_event','Ticket belongs to a different event')",[eventId,t.id,String(m.id)]);return res.json({result:"wrong_event",status:"WRONG EVENT",message:"This pass is for "+t.event_name+", not the selected event.",ticket_no:t.ticket_no});}
  if(t.order_status!=="paid"){return res.json({result:"invalid",status:"PAYMENT NOT CONFIRMED",message:"Order payment is not confirmed. Do not admit."});}
  if(t.ticket_status==="cancelled"||t.ticket_status==="refunded"||t.ticket_status==="invalid")return res.json({result:"rejected",status:t.ticket_status.toUpperCase(),message:"This ticket is "+t.ticket_status+" and cannot be used for entry."});
  if(t.ticket_status==="checked_in"){await db.query("INSERT INTO ep_scan_attempts(event_id,ticket_id,staff_id,result,detail) VALUES($1,$2,$3,'duplicate','Already checked in')",[eventId,t.id,String(m.id)]);return res.json({result:"checked_in",status:"ALREADY CHECKED IN",message:"This ticket has already been used.",ticket_no:t.ticket_no,attendee_name:t.attendee_name,ticket_type:t.ticket_type,checked_in_at:t.checked_in_at});}
  const upd=await db.query("UPDATE ep_tickets SET ticket_status='checked_in' WHERE id=$1 AND ticket_status='valid' AND EXISTS(SELECT 1 FROM ep_orders WHERE id=ep_tickets.order_id AND order_status='paid') RETURNING id",[t.id]);
  if(!upd.rows.length){const previous=await db.query("SELECT checked_in_at FROM ep_checkins WHERE ticket_id=$1",[t.id]);return res.json({result:"checked_in",status:"ALREADY CHECKED IN",message:"Another scanner already confirmed entry.",ticket_no:t.ticket_no,checked_in_at:previous.rows[0]?.checked_in_at||null});}
  await db.query("INSERT INTO ep_checkins(ticket_id,event_id,staff_id) VALUES($1,$2,$3)",[t.id,eventId,String(m.id)]);
  await db.query("INSERT INTO ep_scan_attempts(event_id,ticket_id,staff_id,result,detail) VALUES($1,$2,$3,'valid','Entry accepted')",[eventId,t.id,String(m.id)]);
  return res.json({result:"valid",status:"VALID TICKET",message:"Entry confirmed. Ready for the next ticket.",ticket_no:t.ticket_no,attendee_name:t.attendee_name,ticket_type:t.ticket_type,checked_in_at:new Date().toISOString()});
 }catch(e){console.log("staff_scan_error",String(e));return res.status(503).json({result:"error",status:"VERIFICATION FAILED",message:"Network or server issue. This ticket was not confirmed. Retry when connected."});}
}