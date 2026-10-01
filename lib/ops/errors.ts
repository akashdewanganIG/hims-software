/**
 * The error every read and write reports, in both modes: a stable code (with
 * its HTTP status) and a message fit to show the user.
 */
import { DomainError } from "../sim/tx";

export const OPERATION_ERROR_STATUS = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  UNKNOWN_OPERATION: 404,
  CONFLICT: 409,
  RULE_VIOLATION: 422,
  INTERNAL: 500,
  UNAVAILABLE: 503,
} as const;

export type OperationErrorCode = keyof typeof OPERATION_ERROR_STATUS;

export class OperationError extends Error {
  readonly code: OperationErrorCode;
  constructor(code: OperationErrorCode, message: string) {
    super(message);
    this.name = "OperationError";
    this.code = code;
  }
  get status(): number {
    return OPERATION_ERROR_STATUS[this.code];
  }
}

/** Any thrown value → an OperationError (domain rules keep their message). */
export function toOperationError(error: unknown): OperationError {
  if (error instanceof OperationError) return error;
  if (error instanceof DomainError)
    return new OperationError("RULE_VIOLATION", error.message);
  return new OperationError(
    "INTERNAL",
    "Something went wrong while saving. Nothing was changed."
  );
}
