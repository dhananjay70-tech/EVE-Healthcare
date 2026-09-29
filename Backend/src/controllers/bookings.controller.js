const bookingsService = require('../services/bookings.service');

async function create(req, res, next) {
  try {
    const { testId, centreId, appointmentAt } = req.validatedBody;
    const booking = await bookingsService.createBooking({
      userId: req.user.id,
      testId,
      centreId,
      appointmentAt,
    });
    res.status(201).json({ success: true, data: { booking } });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { page, limit } = req.validatedQuery;
    const { bookings, pagination } = await bookingsService.listBookingsForUser(req.user.id, { page, limit });
    res.status(200).json({ success: true, data: { bookings, pagination } });
  } catch (err) {
    next(err);
  }
}

async function getById(req, res, next) {
  try {
    const { id } = req.validatedParams;
    const booking = await bookingsService.getBookingById(id, req.user.id);
    res.status(200).json({ success: true, data: { booking } });
  } catch (err) {
    next(err);
  }
}

async function cancel(req, res, next) {
  try {
    const { id } = req.validatedParams;
    const { booking, hadSuccessfulPayment } = await bookingsService.cancelBooking(id, req.user.id);
    res.status(200).json({
      success: true,
      data: {
        booking,
        ...(hadSuccessfulPayment && {
          note: 'This booking had a successful simulated payment. No real refund has been processed (payments are simulated, not a real gateway).',
        }),
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getById, cancel };
