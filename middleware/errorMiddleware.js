// Last middleware: turns every thrown error into a readable JSON response.
function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Something went wrong';

  if (err.code === 11000) {
    status = 409;
    message = 'A record with the same unique value already exists';
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid id';
  }

  if (status === 500) console.error(err);
  res.status(status).json({ message });
}

export { notFound, errorHandler };
