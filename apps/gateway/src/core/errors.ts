export class AppError extends Error {
  readonly status: number;

  readonly code: string;

  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class CircuitOpenError extends AppError {
  constructor(message = 'Circuitul furnizorului este deschis') {
    super(503, 'CIRCUIT_OPEN', message);
    this.name = 'CircuitOpenError';
  }
}
