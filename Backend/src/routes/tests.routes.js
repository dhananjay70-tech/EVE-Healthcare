const express = require('express');
const testsController = require('../controllers/tests.controller');
const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/requireAdmin');
const validateRequest = require('../middleware/validateRequest');
const { idParamSchema } = require('../validators/common.validators');
const { createTestSchema, updateTestSchema } = require('../validators/tests.validators');

const router = express.Router();

// Public read
router.get('/:id', validateRequest({ params: idParamSchema }), testsController.getById);

// Admin-only writes
router.post('/', authenticate, requireAdmin, validateRequest({ body: createTestSchema }), testsController.create);
router.patch(
  '/:id',
  authenticate,
  requireAdmin,
  validateRequest({ params: idParamSchema, body: updateTestSchema }),
  testsController.update,
);
router.delete('/:id', authenticate, requireAdmin, validateRequest({ params: idParamSchema }), testsController.remove);

module.exports = router;
