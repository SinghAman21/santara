import Copy from './Copy';
import Move from './Move';
import CopyPath from './CopyPath';
import OpenTerminal from './OpenTerminal';
import QuickPreview from './QuickPreview';
import type { Bridge } from '../common/types';
const actions: Record<string,Bridge['fileAction']> = {
 'copy': Copy,
 'move': Move,
 'copy-path': CopyPath,
 'terminal': OpenTerminal,
 'preview': QuickPreview,
};
export const performFileAction: Bridge['fileAction'] = request => {
 const handler=actions[request.action];
 if(!handler)return Promise.reject(new Error('This file action is unavailable.'));
 return handler(request);
};
