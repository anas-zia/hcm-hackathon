// Error with an HTTP status code, so services can say "422 - over balance" etc.
class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export default AppError;
