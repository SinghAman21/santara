import type { Bridge } from '../../common/types';
export type ActionRequest = Omit<Parameters<Bridge['fileAction']>[0], 'action'>;
