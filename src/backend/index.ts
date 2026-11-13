import { ONLINE } from '../lib/config';
import { createDemoBackend } from './demo';
import { createOnlineBackend } from './online';
import type { Backend } from './types';

export const backend: Backend = ONLINE ? createOnlineBackend() : createDemoBackend();
export * from './types';
