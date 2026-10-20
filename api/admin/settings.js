import { db } from "hatchable";
export const access="admin";
export const methods=["GET","POST"];
const keys=["brand_name","logo_url","brand_color","support_email","footer_text","privacy_text","terms_text","refund_text"];
export default async function(req,res){
 try{
  if(req.method==="GET"){const r=await db.query("SELECT setting_key,setting_value FROM ep_site_settings");return res.json({settings:Object.fromEntries(r.rows.map(x=>[x.setting_key,x.setting_value]))})}
  const b=req.body||{},actor=req.member;
  for(const k of keys)if(b[k]!==undefined){
   let v=String(b[k]??"").trim();
   if(k==="brand_name"&&(v.length<2||v.length>60))return res.status(400).json({error:"Brand name must contain 2–60 characters."});
   if(k==="brand_color"&&!/^#[0-9a-fA-F]{6}$/.test(v))return res.status(400).json({error:"Brand colour must be a six-digit hex code."});
   if(k==="support_email"&&v&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))return res.status(400).json({error:"Enter a valid support email."});
   if(k==="logo_url"&&v&&(!v.startsWith("https://")||v.length>700))return res.status(400).json({error:"Logo URL must be a valid HTTPS image URL."});
   if(v.length>(k.endsWith("_text")?12000:2000))return res.status(400).json({error:"One of the settings is too long."});
   await db.query("INSERT INTO ep_site_settings(setting_key,setting_value,updated_by,updated_at) VALUES($1,$2::jsonb,$3,now()) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_by=EXCLUDED.updated_by,updated_at=now()",[k,JSON.stringify(v),String(actor.id)]);
  }
  await db.query("INSERT INTO ep_audit_logs(actor_id,actor_email,action,target_type,target_id,details) VALUES($1,$2,'site_settings_updated','settings','brand',$3::jsonb)",[String(actor.id),actor.email||"",JSON.stringify({keys:Object.keys(b).filter(k=>keys.includes(k))})]);
  return res.json({ok:true,message:"Site settings saved."});
 }catch(e){console.log("admin_settings_error",String(e));return res.status(500).json({error:"Could not save site settings."})}
}