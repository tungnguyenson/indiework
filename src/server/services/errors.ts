/** Typed service errors that adapters map to HTTP status / MCP error content. */
export type ServiceErrorCode =
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'bad_request'
  | 'unauthorized';

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
export const unauthorized = (msg = 'Not authenticated') => new ServiceError('unauthorized', msg);
