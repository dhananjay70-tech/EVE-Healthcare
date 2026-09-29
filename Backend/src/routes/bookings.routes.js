const express = require('express');
const bookingsController = require('../controllers/bookings.controller');
const authenticate = require('../middleware/authenticate');
const validateRequest = require('../middleware/validateRequest');
const { idParamSchema, paginationQuerySchema } = require('../validators/common.validators');
const { createBookingSchema } = require('../validators/bookings.validators');

const router = express.Router();

// Every booking route requires a logged-in user; the user id always comes
// from the verified JWT (req.user), never from the request body/params.
router.use(authenticate);

router.post('/', validateRequest({ body: createBookingSchema }), bookingsController.create);
router.get('/', validateRequest({ query: paginationQuerySchema }), bookingsController.list);
router.get('/:id', validateRequest({ params: idParamSchema }), bookingsController.getById);
router.patch('/:id/cancel', validateRequest({ params: idParamSchema }), bookingsController.cancel);

module.exports = router;
