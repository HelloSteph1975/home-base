'use strict';

// An error with an HTTP status. Its message is shown to the person, so write it plainly.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { HttpError };
