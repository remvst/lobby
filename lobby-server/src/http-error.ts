export class HttpError extends Error {
    constructor(
        readonly statusCode: number,
        message: string,
    ) {
        super(message);
    }
}

export class InternalError extends HttpError {
    constructor(message: string = 'Internal error') {
        super(500, message);
    }
}

export class NotFoundError extends HttpError {
    constructor(message: string = 'Not found') {
        super(404, message);
    }
}

export class BadRequestError extends HttpError {
    constructor(message: string = 'Bad request') {
        super(400, message);
    }
}

export class ForbiddenError extends HttpError {
    constructor(message: string = 'Forbidden') {
        super(403, message);
    }
}
