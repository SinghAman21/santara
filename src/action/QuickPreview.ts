import { api } from '../common/bridge';
import type { ActionRequest } from './common/types';
export default function quickPreview(request:ActionRequest) { return api.fileAction({...request,action:'preview'}); }
