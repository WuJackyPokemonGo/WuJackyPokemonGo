// Decides what to write to data/catalog-snapshot.json.
// generated_at = when the product data last changed; checked_at = when it was last confirmed against Supabase.
// Readers (the shop fallback, the LINE helper) judge freshness by checked_at. To avoid a commit every 30 minutes,
// an unchanged catalog only refreshes checked_at once it is at least HEARTBEAT_MS old.
export const HEARTBEAT_MS=3*3600*1000;
export function nextSnapshot(previous,products,now=new Date()){
 const iso=now.toISOString();
 if(!previous||JSON.stringify(previous.products)!==JSON.stringify(products))return {generated_at:iso,checked_at:iso,products};
 const last=Date.parse(previous.checked_at??previous.generated_at??'');
 if(Number.isNaN(last)||now.getTime()-last>=HEARTBEAT_MS)return {generated_at:previous.generated_at??iso,checked_at:iso,products:previous.products};
 return null;
}
