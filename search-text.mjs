// Preserve compact searches such as "ShinyPikachu" and let separate words match across fields.
export function normalizeSearchText(value){
 return String(value??'').normalize('NFKD').replace(/(\p{Script=Latin})\p{M}+/gu,'$1').normalize('NFC').toLowerCase().trim();
}
export function matchesSearchText(fields,query){
 const words=normalizeSearchText(query).split(/\s+/u).filter(Boolean);
 const text=normalizeSearchText(fields.join(' ')).replace(/[\s\-–—_]/gu,'');
 return words.every(word=>text.includes(word.replace(/[\-–—_]/gu,'')));
}
