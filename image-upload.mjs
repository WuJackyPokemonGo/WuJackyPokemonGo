export function imageType(bytes){
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {mime:'image/jpeg',extension:'jpg'};
 if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return {mime:'image/png',extension:'png'};
 if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return {mime:'image/webp',extension:'webp'};
 throw Error('只支援 JPG、PNG 或 WebP 圖片。');
}
export async function encodeThumbnail(canvas){
 for(const mime of ['image/webp','image/png']){
  try{const blob=await new Promise((resolve,reject)=>{try{canvas.toBlob(resolve,mime,.85)}catch(error){reject(error)}});if(!blob?.size)continue;const actual=imageType(new Uint8Array(await blob.slice(0,12).arrayBuffer()));if(!['image/webp','image/png'].includes(actual.mime))continue;return blob.type===actual.mime?blob:new Blob([blob],{type:actual.mime})}catch{/* Unsupported WebP encoding falls back to the browser's PNG encoder. */}
 }
 throw Error('圖片縮圖產生失敗，請重新選取圖片後再試。');
}
export async function createThumbnail(img,{createCanvas=()=>document.createElement('canvas'),encode=encodeThumbnail}={}){
 const canvas=createCanvas();let limit=900;
 for(let attempt=0;attempt<7;attempt++){
  const scale=Math.min(1,limit/Math.max(img.naturalWidth,img.naturalHeight));canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));const context=canvas.getContext('2d');if(!context)throw Error('此瀏覽器暫時無法處理圖片，請重新開啟後台後再試。');context.drawImage(img,0,0,canvas.width,canvas.height);
  const blob=await encode(canvas);if(blob.size<=2*1024*1024)return blob;limit=Math.max(1,Math.floor(limit*.8));
 }
 throw Error('圖片縮圖仍超過 2 MB，請選擇較小的圖片後再試。');
}
export async function prepareImage(file){
 if(!file||!file.size||file.size>10*1024*1024)throw Error('圖片需介於 1 byte 至 10 MB。');
 const type=imageType(new Uint8Array(await file.slice(0,12).arrayBuffer()));
 if(file.type&&file.type!==type.mime)throw Error('圖片格式與檔案類型不一致，請重新匯出圖片。');
 const url=URL.createObjectURL(file),img=new Image();
 try{img.src=url;await img.decode();if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>40000000)throw Error('圖片尺寸過大或無法解碼。');
 const thumbnail=await createThumbnail(img);
 return {original:new Blob([file],{type:type.mime}),thumbnail,extension:type.extension};
 }finally{URL.revokeObjectURL(url)}
}
