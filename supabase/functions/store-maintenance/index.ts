import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {runMaintenance} from './worker.mjs';
Deno.serve(async request=>{
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 const token=request.headers.get('x-maintenance-token');if(!token||!/^[a-f0-9]{64}$/.test(token))return new Response('Unauthorized',{status:401});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return new Response('Unavailable',{status:503});
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{return Response.json(await runMaintenance({client,token}))}catch(error){return Response.json({error:error?.code==='42501'?'unauthorized':'maintenance_failed'},{status:error?.code==='42501'?401:500})}
});
