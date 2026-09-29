const express = require('express');
const centresController = require('../controllers/centres.controller');
const authenticate = require('../middleware/authenticate');
const requireAdmin = require('../middleware/requireAdmin');
const validateRequest = require('../middleware/validateRequest');
const { idParamSchema, paginationQuerySchema } = require('../validators/common.validators');
const { createCentreSchema, updateCentreSchema } = require('../validators/centres.validators');

const router = express.Router();

// Public reads
router.get('/', validateRequest({ query: paginationQuerySchema }), centresController.list);
router.get('/:id', validateRequest({ params: idParamSchema }), centresController.getById);
router.get(
  '/:id/tests',
  validateRequest({ params: idParamSchema, query: paginationQuerySchema }),
  centresController.listTests,
);

// Admin-only writes
router.post(
  '/',
  authenticate,
  requireAdmin,
  validateRequest({ body: createCentreSchema }),
  centresController.create,
);
router.patch(
  '/:id',
  authenticate,
  requireAdmin,
  validateRequest({ params: idParamSchema, body: updateCentreSchema }),
  centresController.update,
);
router.delete(
  '/:id',
  authenticate,
  requireAdmin,
  validateRequest({ params: idParamSchema }),
  centresController.remove,
);

module.exports = router;
