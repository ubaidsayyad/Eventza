import { db, email, config } from "hatchable";
export const access = "public";
export const methods = ["POST"];
export default async function(req,res){
  const b=req.body||{};
  const name=String(b.full_name||"").trim(), addr=String(b.email||"").trim().toLowerCase(), subject=String(b.subject||"").trim(), message=String(b.message||"").trim();
  if(name.length<2||name.length>120||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)||subject.length<3||subject.length>180||message.length<10||message.length>5000)return res.status(400).json({error:"Please complete all fields with a valid email and a message of at least 10 characters."});
  try{
    await db.query("INSERT INTO ep_support_messages(full_name,email,subject,message) VALUES($1,$2,$3,$4)",[name,addr,subject,message]);
    return res.status(201).json({ok:true,message:"Your message has been received. Our team will follow up if email support is configured."});
  }catch(e){console.log("contact_error",String(e));return res.status(500).json({error:"We couldn't save your message. Please try again."});}
}