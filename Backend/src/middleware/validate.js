// Reusable request-body validator: runs a Zod schema against req.body and
// attaches the parsed, coerced result to req.validatedBody for handlers to use.
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const message = result.error.issues.map((issue) => issue.message).join('; ');
      return res.status(400).json({ success: false, message });
    }

    req.validatedBody = result.data;
    next();
  };
}

module.exports = validate;
