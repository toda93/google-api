export class ErrorException {
    constructor(code, errors = []) {
        this.name = 'ErrorException';
        this.message = code;
        this.code = code;
        this.errors = errors;
    }
}