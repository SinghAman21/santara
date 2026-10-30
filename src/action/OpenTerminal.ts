import { api } from '../common/bridge';
import type { ActionRequest } from './common/types';
export default function openTerminal(request:ActionRequest) { return api.fileAction({...request,action:'terminal'}); }
