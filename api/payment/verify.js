import { db, config, webhooks } from "hatchable";
import { fulfillCapturedPayment } from "lib/fulfill-order.js";
export const access="public";
export const methods=["POST"];
export default async function(req,res){
 const b=req.body||{}, providerOrderId=String(b.razorpay_order_id||""), paymentId=String(b.razorpay_payment_id||""), signature=String(b.razorpay_signature||"");
 if(!providerOrderId||!paymentId||!signature)return res.status(400).json({error:"Payment verification details are incomplete."});
 try{
  let keyId="",keySecret="";
  try{keyId=await config.get("RAZORPAY_KEY_ID");keySecret=await config.get("RAZORPAY_KEY_SECRET");}catch(_){}
  if(!keyId||!String(keyId).startsWith("rzp_test_")||!keySecret)return res.status(503).json({error:"Razorpay TEST credentials are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Hatchable Setup before verifying payments. No ticket was issued."});
  const sigOk=await webhooks.verifyHmac({raw:providerOrderId+"|"+paymentId,signature,secret:keySecret,encoding:"hex"});
  if(!sigOk)return res.status(400).json({error:"Payment signature could not be verified. No ticket was issued."});
  const paymentResponse=await fetch("https://api.razorpay.com/v1/payments/"+encodeURIComponent(paymentId),{headers:{Authorization:"Basic "+btoa(keyId+":"+keySecret)}});
  const providerPayment=await paymentResponse.json();
  if(!paymentResponse.ok||providerPayment.order_id!==providerOrderId)return res.status(400).json({error:"The payment does not match this checkout order."});
  const local=await db.query("SELECT p.id,p.amount,o.id AS order_id,o.booking_ref,o.order_status FROM ep_payments p JOIN ep_orders o ON o.id=p.order_id WHERE p.provider_order_id=$1",[providerOrderId]);
  if(!local.rows.length)return res.status(404).json({error:"Checkout order not found."});
  if(Math.round(Number(local.rows[0].amount)*100)!==Number(providerPayment.amount)||providerPayment.currency!=="INR")return res.status(400).json({error:"The payment amount does not match the booking."});
  if(providerPayment.status!=="captured"){
    return res.status(202).json({ok:false,payment_status:providerPayment.status==="failed"?"failed":"pending",booking_ref:local.rows[0].booking_ref,message:"Payment has not reached captured status yet. Eventza will not issue tickets until capture is verified."});
  }
  const result=await fulfillCapturedPayment({providerOrderId,paymentId,paymentPayload:{status:providerPayment.status,amount:providerPayment.amount,currency:providerPayment.currency},req});
  return res.json({ok:true,payment_status:"paid",booking_ref:result.booking_ref,tickets_issued:result.tickets||0,already_processed:!!result.already_paid});
 }catch(e){console.log("payment_verify_error",String(e));return res.status(503).json({error:"We could not verify payment with Razorpay. Do not pay again yet; check your booking status or contact support."});}
}