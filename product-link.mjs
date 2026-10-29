// Share only the product identity and selected language, never unrelated URL parameters.
export function productLink(currentURL,id,locale='zh'){
 const url=new URL(currentURL);
 url.search='';url.hash='';
 url.searchParams.set('product',id);
 url.searchParams.set('lang',locale==='en'?'en':'zh');
 return url.href;
}
