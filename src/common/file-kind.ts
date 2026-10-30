import type { LocalFile } from './types';
export type WheelFamily = LocalFile['category'] | 'epub' | 'mixed';
const extensions: Record<string,LocalFile['category']> = {};
for (const [category, list] of Object.entries({ image:'jpg jpeg png webp heic heif tiff tif avif bmp svg gif', video:'mp4 mov mkv webm avi wmv m4v', audio:'mp3 m4a wav flac ogg opus aiff aif wma aac', pdf:'pdf', archive:'zip tar gz gzip rar 7z', document:'docx doc odt md markdown txt epub rtf html htm', presentation:'ppt pptx odp', spreadsheet:'xlsx xls ods csv tsv', subtitle:'srt vtt ass ssa' })) {
 for(const extension of list.split(' '))extensions[extension]=category as LocalFile['category'];
}
export function categoryForExtension(extension:string):LocalFile['category'] { return extensions[extension.replace(/^\./,'').toLowerCase()] || 'other'; }
export function categoryForMime(mime:string):LocalFile['category'] {
 if(mime.startsWith('video/') || mime==='application/x-matroska')return 'video';
 if(mime.startsWith('audio/'))return 'audio';
 if(mime.startsWith('image/'))return 'image';
 const categories:Record<string,LocalFile['category']>={'application/pdf':'pdf','application/zip':'archive','application/epub+zip':'document','text/vtt':'subtitle','application/x-subrip':'subtitle'};
 return categories[mime.toLowerCase()] || 'other';
}
export function wheelFamily(files:LocalFile[]):WheelFamily {
 const families=new Set(files.map(file=>file.ext.toLowerCase()==='epub'?'epub':file.category));
 return families.size>1?'mixed':families.values().next().value || 'other';
}
export function hintedFiles(transfer:DataTransfer):LocalFile[] {
 const files=Array.from(transfer.items).filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter((file):file is File=>!!file);
 const candidates=files.length?files:Array.from(transfer.files);
 if(candidates.length)return candidates.map((file,index)=>{
  const ext=file.name.includes('.')?file.name.split('.').pop()!.toLowerCase():'';
  const category=categoryForExtension(ext);
  return {id:`hint-${index}`,name:file.name,path:'',size:file.size,ext,category:category==='other'?categoryForMime(file.type):category};
 });
 return Array.from(transfer.items).filter(item=>item.kind==='file').map((item,index)=>({id:`hint-${index}`,name:'Dragged file',path:'',size:0,ext:'',category:categoryForMime(item.type)}));
}
