import { db, browser } from "hatchable";
import { sha256 } from "lib/crypto.js";
export const access="public";
export const methods=["GET"];
export default async function(req,res){
 const token=String(req.query.token||"");
 if(token.length<40||token.length>100)return res.status(400).json({error:"This pass link is invalid."});
 try{
  const hash=await sha256(token);
  const check=await db.query("SELECT tk.ticket_no,tk.ticket_status,o.order_status FROM ep_tickets tk JOIN ep_orders o ON o.id=tk.order_id WHERE tk.qr_token_hash=$1",[hash]);
  if(!check.rows.length)return res.status(404).json({error:"Pass not found."});
  const origin=(req.headers["x-forwarded-proto"]||"https")+"://"+(req.headers.host||"eventpass.hatchable.site");
  const pdf=await browser.session(async page=>{
   await page.goto(origin+"/pass.html?token="+encodeURIComponent(token),{waitUntil:"networkidle2"});
   await page.waitForSelector(".ticket-top",{timeout:12000});
   await page.waitForFunction(()=>{const img=document.querySelector("#qr");return !!(img&&img.complete&&img.naturalWidth>0)}, {timeout:12000});
   return await page.pdf({format:"A4",printBackground:true});
  });
  res.setHeader("Content-Type","application/pdf");
  res.setHeader("Content-Disposition",'attachment; filename="Eventza-'+String(check.rows[0].ticket_no).replace(/[^A-Za-z0-9-]/g,"")+'.pdf"');
  res.setHeader("Cache-Control","no-store");
  return res.send(pdf);
 }catch(e){console.log("pass_pdf_error",String(e));return res.status(503).json({error:"The PDF could not be generated right now. Open the pass in your browser and choose Print / Save as PDF instead."});}
}