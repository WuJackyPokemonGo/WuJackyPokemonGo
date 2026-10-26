import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createCheckoutHandler} from './worker.mjs';
const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(createCheckoutHandler({client,origins:(Deno.env.get('CHECKOUT_ALLOWED_ORIGINS')||'').split(',').filter(Boolean),turnstileSecret:Deno.env.get('CHECKOUT_TURNSTILE_SECRET'),turnstileHostname:Deno.env.get('CHECKOUT_TURNSTILE_HOSTNAME')}));
