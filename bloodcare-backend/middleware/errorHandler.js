function notFound(req, res, next) {
    res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
    // Log technical error details to server console for debugging
    console.error(`[Error] ${req.method} ${req.originalUrl}:`, err.message || err);

    // Express body-parser sets err.status = 400 for malformed JSON
    let status = err.status || err.statusCode || 500;
    let message = err.message || "Internal server error";

    if (err instanceof SyntaxError && "body" in err && err.status === 400) {
        status = 400;
        message = "Malformed JSON syntax in request body.";
    }

    // Never leak raw MySQL syntax/connection error messages to clients
    if (status === 500 && !res.headersSent) {
        message = "An internal server error occurred. Please try again later.";
    }

    if (res.headersSent) {
        return next(err);
    }

    res.status(status).json({
        success: false,
        message,
    });
}

module.exports = { notFound, errorHandler };