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
