'use strict';

const express = require('express');
const { API_VERSION }                  = require('./helpers');
const { registerSwaggerRoutes }        = require('./routes/swagger');
const { registerCreateDataRoutes }     = require('./routes/createData');
const { registerSimulationRoutes }     = require('./routes/simulation');
const { registerCloudaggRoutes }       = require('./routes/cloudagg');

const ADMIN_ROUTES = ['/create-data', '/add-in-simulation-queue', '/clear-simulations', '/reset-store'];

function createApp(repository, simulationQueue, { configure } = {}) {
  const app = express();

  // Block admin/test routes in production
  app.use(ADMIN_ROUTES, (req, res, next) => {
    if (process.env.NODE_ENV === 'production')
      return res.status(403).json({ code: 403, status: 'Forbidden', message: 'not_available_in_production', api_version: API_VERSION });
    next();
  });

  registerSwaggerRoutes(app, repository);
  registerCreateDataRoutes(app, repository);
  registerSimulationRoutes(app, simulationQueue, repository);
  registerCloudaggRoutes(app, repository, simulationQueue);

  if (configure) configure(app);

  // Global async error handler — catches unhandled rejections from async routes
  app.use((error, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error('[UNHANDLED ERROR]', error);
    res.json({ code: 500, status: 'Internal Server Error', message: 'unexpected_error', api_version: API_VERSION });
  });

  return app;
}

module.exports = { createApp };
