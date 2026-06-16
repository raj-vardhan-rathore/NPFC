import type { RequestHandler } from "express";
import type { ZodSchema } from "zod";

export const validate = (schema: ZodSchema): RequestHandler => (req, _res, next) => {
  const parsed = schema.safeParse({ body: req.body, query: req.query, params: req.params });
  if (!parsed.success) {
    return next(Object.assign(new Error("Validation failed."), { status: 400, details: parsed.error.flatten() }));
  }
  Object.assign(req, parsed.data);
  next();
};
