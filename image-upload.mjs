export function imageType(bytes){
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {mime:'image/jpeg',extension:'jpg'};
 if([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return {mime:'image/png',extension:'png'};
 if(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return {mime:'image/webp',extension:'webp'};
 throw Error('只支援 JPG、PNG 或 WebP 圖片。');
}
export async function prepareImage(file){
 if(!file||!file.size||file.size>10*1024*1024)throw Error('圖片需介於 1 byte 至 10 MB。');
 const type=imageType(new Uint8Array(await file.slice(0,12).arrayBuffer()));
 if(file.type&&file.type!==type.mime)throw Error('圖片格式與檔案類型不一致，請重新匯出圖片。');
 const url=URL.createObjectURL(file),img=new Image();
 try{img.src=url;await img.decode();if(!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>40000000)throw Error('圖片尺寸過大或無法解碼。');
 const scale=Math.min(1,900/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
 const thumbnail=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.85));if(!thumbnail||thumbnail.type!=='image/webp')throw Error('此瀏覽器無法產生 WebP 縮圖，請使用更新版本瀏覽器。');
 return {original:new Blob([file],{type:type.mime}),thumbnail,extension:type.extension};
 }finally{URL.revokeObjectURL(url)}
}
