const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const centresRoutes = require('./routes/centres.routes');
const testsRoutes = require('./routes/tests.routes');
const bookingsRoutes = require('./routes/bookings.routes');
const paymentsRoutes = require('./routes/payments.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'EVE Healthcare Backend is running',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/centres', centresRoutes);
app.use('/api/tests', testsRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/payments', paymentsRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// Centralized error handler. Kept last so any thrown/next(err) error from
// routes and middleware above lands here with one consistent response shape.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    message: isProduction && statusCode === 500 ? 'Internal server error' : err.message,
  });
});

module.exports = app;
