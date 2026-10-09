import type { ErrorCode } from './types';
export class HubError extends Error { constructor(public readonly code: ErrorCode) { super(code); this.name = 'HubError'; } }
export function errorCode(error: unknown): ErrorCode { return error instanceof HubError ? error.code : 'storage.failed'; }
