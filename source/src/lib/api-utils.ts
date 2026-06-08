import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

/**
 * Structured API error with HTTP status and optional error code.
 * Used consistently across all API routes.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Maps legacy plain-object error codes to HTTP status codes. */
const LEGACY_STATUS_MAP: Record<string, number> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  BAD_REQUEST: 400,
  FORBIDDEN: 403,
  UNAUTHORIZED: 401,
};

/**
 * Central error handler for all API routes.
 * Handles ApiError, ZodError, and unknown errors uniformly.
 */
export function handleApiError(error: unknown): NextResponse {
  // Known structured API error
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }

  // Zod v4 uses `.issues`
  if (error instanceof ZodError) {
    const message = error.issues
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    return NextResponse.json(
      { error: message, code: 'VALIDATION_ERROR' },
      { status: 400 }
    );
  }

  // Legacy plain-object throws — kept for backward compatibility during migration
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error
  ) {
    const e = error as { code: string; message: string };
    const status = LEGACY_STATUS_MAP[e.code] ?? 500;
    return NextResponse.json({ error: e.message, code: e.code }, { status });
  }

  // Unknown error — log server-side, return generic 500
  console.error('[API_ERROR]', error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
