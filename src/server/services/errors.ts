/** Typed service errors that adapters map to HTTP status / MCP error content. */
export type ServiceErrorCode =
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden';

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export const notFound = (what: string) => new ServiceError('not_found', `${what} not found`);
export const conflict = (msg: string) => new ServiceError('conflict', msg);
export const badRequest = (msg: string) => new ServiceError('bad_request', msg);
/** Not authenticated (no/invalid session or token) → 401. */
export const unauthorized = (msg = 'Not authenticated') => new ServiceError('unauthorized', msg);
/** Authenticated but the role may not perform this action → 403. */
export const forbidden = (msg = 'Not allowed') => new ServiceError('forbidden', msg);
