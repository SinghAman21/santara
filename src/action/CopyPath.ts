import { api } from '../common/bridge';
import type { ActionRequest } from './common/types';
export default function copyPath(request:ActionRequest) { return api.fileAction({...request,action:'copy-path'}); }
