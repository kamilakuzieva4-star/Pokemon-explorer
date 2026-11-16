export function pageError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = message;
  return error;
}

export function notFound(req, res) {
  res.status(404).render("error", {
    title: "Not found", status: 404, message: "This page does not exist."
  });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  let status = 500;
  let message = "Something went wrong. Please try again in a moment.";
  if (error.type === "entity.too.large" || error.type === "parameters.too.many") {
    status = 413;
    message = "The submitted form is too large. Please enter shorter values.";
  } else if (error.status === 415) {
    status = 415;
    message = "This form encoding is not supported.";
  } else if (error instanceof URIError || error.status === 400) {
    status = 400;
    message = "The request is invalid. Please check the address or form values.";
  }
  if (status === 500) console.error("Application:", error.message);
  res.status(status).render("error", { title: "Unable to load page", status, message });
}
