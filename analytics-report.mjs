// Pure helpers for the admin analytics view; counts are daily aggregates, not per-visitor journeys.
export const FUNNEL_STEPS=[
 ['background_view','背景詳情瀏覽'],
 ['background_product_click','從背景點商品'],
 ['background_referral','抵達商品頁'],
 ['bg_cart_add','加入詢價清單'],
 ['bg_line_click','點官方 LINE'],
];
export function funnelSteps(events={}){let previous=null;return FUNNEL_STEPS.map(([key,label])=>{const count=Number(events[key]??0);const rate=previous===null?null:previous>0?Math.round(count/previous*100):null;previous=count;return {key,label,count,rate}})}
export function overviewTiles(report={}){const e=report.events??{};return [
 ['庫存網站瀏覽',e.page_view],['背景圖鑑瀏覽',e.background_page_view],['匿名工作階段',report.sessions],['加入詢價清單',e.cart_add],['複製詢價',e.inquiry_copy],['點官方 LINE',e.line_click],
].map(([label,value])=>({label,value:Number(value??0)}))}
export function topRows(rows=[],limit=5){return [...rows].sort((a,b)=>Number(b.views??0)-Number(a.views??0)).slice(0,limit)}
const SOURCE_NAMES={threads:'Threads',reddit:'Reddit',discord:'Discord',facebook:'Facebook',instagram:'Instagram',line:'LINE',x:'X',youtube:'YouTube',other:'其他標記'};
// Group source visits by site, split into storefront and atlas arrivals.
export function sourceRows(report={}){const by=new Map();for(const r of report.sources??[]){const [page,src]=String(r.source??'').split(':');if(!SOURCE_NAMES[src]||!['store','atlas'].includes(page))continue;const row=by.get(src)??{source:src,label:SOURCE_NAMES[src],store:0,atlas:0,total:0};row[page]+=Number(r.visits??0);row.total+=Number(r.visits??0);by.set(src,row)}return [...by.values()].sort((a,b)=>b.total-a.total||a.label.localeCompare(b.label))}
