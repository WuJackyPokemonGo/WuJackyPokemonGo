export function parsePokedexNumbers(value){
 let values=value;
 if(typeof values==='string'&&values.trim().startsWith('[')){
  try{values=JSON.parse(values)}catch{throw Error('圖鑑編號請用逗號分隔，例如 1,4,7,25。')}
 }
 if(!Array.isArray(values))values=String(values??'').trim().split(/[,，、\s]+/).filter(Boolean);
 if(values.length>100)throw Error('圖鑑編號最多 100 個。');
 const numbers=values.map(value=>{
  const text=String(value).normalize('NFKC').trim().replace(/^#/,'');
  if(!/^\d+$/.test(text)||!Number.isInteger(Number(text))||Number(text)<1||Number(text)>9999)throw Error('圖鑑編號請填 1～9999 的整數，以逗號分隔。');
  return Number(text);
 });
 return [...new Set(numbers)].sort((a,b)=>a-b);
}
export function storedPokedexNumbers(product){
 return Array.isArray(product?.pokedex_numbers)&&product.pokedex_numbers.length?product.pokedex_numbers:(product?.pokedex_number?[product.pokedex_number]:[]);
}
