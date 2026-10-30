import { api } from '../../common/bridge';
import type { Capability, LocalFile, Settings } from '../../common/types';
export async function enqueueLocalOperation(capability:Capability, format:string, files:LocalFile[], settings:Settings, values:Record<string,string>) {
 const options:Record<string,unknown>={quality:settings.quality,stripMetadata:settings.stripMetadata,outputFolder:settings.outputFolder,collision:settings.collision,recursive:settings.recursive,preserveStructure:settings.preserveStructure,...values};
 for(const key of ['stripMetadata','reencode','flipHorizontal','flipVertical','recursive','preserveStructure']) if(typeof options[key]==='string') {
  if(!['true','false'].includes(options[key] as string)) throw new Error(`Invalid ${key}`);
  options[key]=options[key]==='true';
 }
 if(typeof options.quality==='string')options.quality=Number(options.quality);
 await api.enqueue({files,operation:capability.operation||capability.id.split(':').pop()!,format,options});
}
