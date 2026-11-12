export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(status: number, code: string, message: string, options?: { details?: unknown; expose?: boolean; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = options?.details;
    this.expose = options?.expose ?? status < 500;
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: unknown) {
    super(400, "bad_request", message, { details });
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown, message = "Validation failed") {
    super(422, "validation_error", message, { details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(401, "unauthorized", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource") {
    super(403, "forbidden", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, "not_found", message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(409, "conflict", message);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = "File is too large") {
    super(413, "payload_too_large", message);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message = "Unsupported file type") {
    super(415, "unsupported_media_type", message);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service unavailable", details?: unknown) {
    super(503, "service_unavailable", message, { details, expose: true });
  }
}

/** Raised when an AI provider call fails. Messages are safe to show to users. */
export class ProviderError extends AppError {
  readonly provider: string;
  readonly retryable: boolean;
  constructor(provider: string, message: string, options?: { retryable?: boolean; cause?: unknown; details?: unknown }) {
    super(502, "provider_error", message, { expose: true, cause: options?.cause, details: options?.details });
    this.provider = provider;
    this.retryable = options?.retryable ?? true;
  }
}
