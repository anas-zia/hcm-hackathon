// Lets controllers use async/await without try/catch in every function.
export default (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
