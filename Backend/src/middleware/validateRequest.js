function formatIssues(zodError) {
  return zodError.issues.map((issue) => issue.message).join('; ');
}

// Generic request validator: like middleware/validate.js (body-only), but
// can validate route params and/or the query string too, since GET routes
// like centres/tests need pagination + id validation rather than a body.
function validateRequest({ params, query, body } = {}) {
  return (req, res, next) => {
    if (params) {
      const result = params.safeParse(req.params);
      if (!result.success) {
        return res.status(400).json({ success: false, message: formatIssues(result.error) });
      }
      req.validatedParams = result.data;
    }

    if (query) {
      const result = query.safeParse(req.query);
      if (!result.success) {
        return res.status(400).json({ success: false, message: formatIssues(result.error) });
      }
      req.validatedQuery = result.data;
    }

    if (body) {
      const result = body.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ success: false, message: formatIssues(result.error) });
      }
      req.validatedBody = result.data;
    }

    next();
  };
}

module.exports = validateRequest;
