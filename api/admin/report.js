import { db } from "hatchable";
export const access="admin";
export const methods=["GET"];
function csv(s){const x=String(s??"");return '"'+x.replace(/"/g,'""')+'"';}
export default async function(req,res){
 try{
  const kind=String(req.query.kind||"orders");
  if(kind==="checkins"){
   const r=await db.query("SELECT e.name AS event_name,tk.ticket_no,tk.attendee_name,tt.name AS ticket_type,ci.checked_in_at,ci.staff_id FROM ep_checkins ci JOIN ep_tickets tk ON tk.id=ci.ticket_id JOIN ep_events e ON e.id=ci.event_id JOIN ep_ticket_types tt ON tt.id=tk.ticket_type_id ORDER BY ci.checked_in_at DESC");
   const rows=[["event_name","ticket_no","attendee_name","ticket_type","checked_in_at","staff_id"],...r.rows.map(x=>[x.event_name,x.ticket_no,x.attendee_name,x.ticket_type,x.checked_in_at,x.staff_id])];
   res.setHeader("Content-Type","text/csv; charset=utf-8");res.setHeader("Content-Disposition",'attachment; filename="eventpass-checkins.csv"');return res.send(rows.map(r=>r.map(csv).join(",")).join("\r\n"));
  }
  const r=await db.query("SELECT o.booking_ref,o.purchaser_name,o.purchaser_email,o.purchaser_phone,o.subtotal,o.booking_fees,o.total_amount,o.currency,o.order_status,o.created_at,o.paid_at,e.name AS event_name,tt.name AS ticket_category,oi.quantity,p.provider_payment_id,p.payment_status FROM ep_orders o JOIN ep_order_items oi ON oi.order_id=o.id JOIN ep_events e ON e.id=oi.event_id JOIN ep_ticket_types tt ON tt.id=oi.ticket_type_id LEFT JOIN ep_payments p ON p.order_id=o.id ORDER BY o.created_at DESC");
  const rows=[["booking_ref","purchaser_name","purchaser_email","purchaser_phone","subtotal","booking_fees","total_amount","currency","order_status","created_at","paid_at","event_name","ticket_category","quantity","provider_payment_id","payment_status"],...r.rows.map(x=>[x.booking_ref,x.purchaser_name,x.purchaser_email,x.purchaser_phone,x.subtotal,x.booking_fees,x.total_amount,x.currency,x.order_status,x.created_at,x.paid_at,x.event_name,x.ticket_category,x.quantity,x.provider_payment_id,x.payment_status])];
  res.setHeader("Content-Type","text/csv; charset=utf-8");res.setHeader("Content-Disposition",'attachment; filename="eventpass-orders.csv"');return res.send(rows.map(r=>r.map(csv).join(",")).join("\r\n"));
 }catch(e){console.log("admin_report_error",String(e));return res.status(500).json({error:"Could not export this report."});}
}