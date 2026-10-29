// Only versioned, first-party product assets may bypass Storage thumbnail URLs.
export function catalogAssetPath(path){
 const value=String(path??'');
 return /^assets\/products\/[a-z0-9][a-z0-9-]{0,100}\.(?:jpe?g|png|webp)$/.test(value)?value:'';
}
