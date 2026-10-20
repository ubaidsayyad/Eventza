import { db, config } from "hatchable";
export const access = "public";
export const methods = ["POST"];
function token(){return crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,"");}
async function hash(s){const data=new TextEncoder().encode(s);const h=await crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,"0")).join("");}
export default async function(req,res){
 const b=req.body||{}, eventId=String(b.event_id||""), typeId=String(b.ticket_type_id||""), qty=Number(b.quantity), name=String(b.full_name||"").trim(), emailAddr=String(b.email||"").trim().toLowerCase(), phone=String(b.phone||"").trim();
 if(!eventId||!typeId||!Number.isInteger(qty)||qty<1||qty>10||name.length<2||name.length>120||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddr)||phone.length<7||phone.length>24)return res.status(400).json({error:"Enter your name, valid email, phone, ticket type, and a quantity from 1 to 10."});
 let reserved=false, orderId=null, ticketTypeId=null;
 try{
  const q=await db.query("SELECT e.id AS event_id,e.name AS event_name,e.event_date::text,e.start_time::text,e.end_time::text,e.venue,e.is_sample,e.event_status,e.attendee_names_required,e.attendee_emails_allowed,t.id AS ticket_type_id,t.name AS ticket_name,t.price,t.booking_fee,t.capacity,t.sold_count,t.per_order_limit,t.sales_start,t.sales_end FROM ep_events e JOIN ep_ticket_types t ON t.event_id=e.id WHERE e.id=$1 AND t.id=$2 AND e.event_status='published' AND e.event_date>=CURRENT_DATE",[eventId,typeId]);
  if(!q.rows.length)return res.status(404).json({error:"This event or ticket type is not available."});
  const t=q.rows[0]; if(t.is_sample)return res.status(409).json({error:"This is sample preview data. Sample events cannot be purchased or used as entry tickets. Publish a real event from the admin dashboard first."});
  if(qty>Number(t.per_order_limit))return res.status(400).json({error:"This ticket type allows up to "+t.per_order_limit+" tickets per order."});
  const incoming=Array.isArray(b.attendees)?b.attendees:[],attendees=[];
  if((t.attendee_names_required||t.attendee_emails_allowed)&&incoming.length!==qty)return res.status(400).json({error:"Enter attendee details for each ticket."});
  for(let i=0;i<incoming.length;i++){const a=incoming[i]||{},an=String(a.name||"").trim(),ae=String(a.email||"").trim().toLowerCase();if(t.attendee_names_required&&(an.length<2||an.length>120))return res.status(400).json({error:"Enter each attendee's full name."});if(t.attendee_emails_allowed&&!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(ae))return res.status(400).json({error:"Enter a valid email for each attendee."});attendees.push({name:an||name,email:t.attendee_emails_allowed?ae:emailAddr});}
  let keyId="",keySecret="";
  try{keyId=await config.get("RAZORPAY_KEY_ID");keySecret=await config.get("RAZORPAY_KEY_SECRET");}catch(_){}
  if(!keyId||!keySecret||!String(keyId).startsWith("rzp_test_"))return res.status(503).json({error:"Online checkout is disabled until Razorpay TEST credentials are configured. No inventory has been reserved and no payment has been taken.",payment_configured:false});
  const now=Date.now();if(t.sales_start&&new Date(t.sales_start).getTime()>now)return res.status(409).json({error:"Ticket sales have not opened yet."});if(t.sales_end&&new Date(t.sales_end).getTime()<now)return res.status(409).json({error:"Ticket sales have closed."});
  const reserve=await db.query("UPDATE ep_ticket_types SET sold_count=sold_count+$1 WHERE id=$2 AND capacity-sold_count >= $1 RETURNING id",[qty,typeId]);
  if(!reserve.rows.length)return res.status(409).json({error:"Not enough tickets remain. Please change the quantity and try again."});reserved=true;ticketTypeId=typeId;
  const subtotal=Number(t.price)*qty,fees=Number(t.booking_fee)*qty,total=subtotal+fees,reference="EP-"+crypto.randomUUID().slice(0,8).toUpperCase()+"-"+Date.now().toString(36).toUpperCase(),rawAccess=token(),accessHash=await hash(rawAccess);
  const order=await db.query("INSERT INTO ep_orders(booking_ref,purchaser_name,purchaser_email,purchaser_phone,subtotal,booking_fees,total_amount,access_token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '15 minutes') RETURNING id,booking_ref,order_status,total_amount,currency,expires_at",[reference,name,emailAddr,phone,subtotal,fees,total,accessHash]);
  orderId=order.rows[0].id;
  const item=await db.query("INSERT INTO ep_order_items(order_id,event_id,ticket_type_id,quantity,unit_price,unit_fee,line_total,attendees) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id",[orderId,eventId,typeId,qty,t.price,t.booking_fee,total,JSON.stringify(attendees)]);
  const authHeader="Basic "+btoa(String(keyId)+":"+String(keySecret));
  const payRes=await fetch("https://api.razorpay.com/v1/orders",{method:"POST",headers:{"Authorization":authHeader,"Content-Type":"application/json"},body:JSON.stringify({amount:Math.round(total*100),currency:"INR",receipt:reference,notes:{event_id:eventId,booking_ref:reference,order_id:orderId}})});
  const payData=await payRes.json();
  if(!payRes.ok||!payData.id)throw new Error("Razorpay test checkout order could not be created.");
  await db.query("INSERT INTO ep_payments(order_id,provider_order_id,amount,currency,payment_status,provider_payload) VALUES($1,$2,$3,'INR','pending',$4::jsonb)",[orderId,payData.id,total,JSON.stringify({status:payData.status||"created"})]);
  return res.status(201).json({ok:true,booking_ref:reference,order_id:orderId,order_token:rawAccess,amount:total,currency:"INR",razorpay_order_id:payData.id,razorpay_key_id:keyId,event:{name:t.event_name,date:t.event_date,start_time:t.start_time,venue:t.venue},ticket:{name:t.ticket_name,quantity:qty},payment_mode:"TEST"});
 }catch(e){
  console.log("booking_create_error",String(e));
  if(orderId){try{await db.query("UPDATE ep_orders SET order_status='failed',updated_at=now() WHERE id=$1",[orderId]);}catch(_){}}
  if(reserved&&ticketTypeId){try{await db.query("UPDATE ep_ticket_types SET sold_count=GREATEST(0,sold_count-$1) WHERE id=$2",[qty,ticketTypeId]);}catch(_){}}
  return res.status(503).json({error:"Checkout could not be initialized. No ticket has been issued and no payment has been confirmed. Please try again later."});
 }
}