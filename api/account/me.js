import { auth } from "hatchable";
export const access="user";
export const methods=["GET"];
export default async function(req,res){
 try{
  const user=await auth.getUser(req);
  if(!user)return res.status(401).json({error:"Sign in to view your Eventza account."});
  return res.json({user:{id:user.id,email:user.email,name:user.name||"",image:user.image||null}});
 }catch(e){console.log("account_me_error",String(e));return res.status(401).json({error:"Your session could not be verified. Sign in again."});}
}