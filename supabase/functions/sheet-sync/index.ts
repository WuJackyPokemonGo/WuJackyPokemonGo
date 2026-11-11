import {createSheetSyncHandler,googleSheet} from './worker.mjs';
import {DEFAULT_SHEET_CONFIG} from './core.mjs';
const config=Deno.env.get('SHEET_SYNC_CONFIG')?JSON.parse(Deno.env.get('SHEET_SYNC_CONFIG')!):DEFAULT_SHEET_CONFIG;
Deno.serve(createSheetSyncHandler({url:Deno.env.get('SUPABASE_URL')!,anonKey:Deno.env.get('SUPABASE_ANON_KEY')!,serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
 origins:(Deno.env.get('SHEET_SYNC_ALLOWED_ORIGINS')||'https://wujackypokemongo.github.io').split(',').filter(Boolean),cronSecret:Deno.env.get('SHEET_SYNC_CRON_SECRET')||'',config,
 makeSheet:()=>googleSheet({serviceAccount:Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')!,spreadsheetId:Deno.env.get('SHEET_SPREADSHEET_ID')!})}));
