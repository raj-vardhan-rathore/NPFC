export const notFound = () => Object.assign(new Error("Route not found."), { status: 404 });
export const errorHandler = (error, _req, res, _next) => {
    const status = Number(error.status || 500);
    res.status(status).json({
        success: false,
        message: error.message || "Internal server error.",
        ...(error.details ? { details: error.details } : {})
    });
};
