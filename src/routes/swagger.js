'use strict';

const swaggerUi = require('swagger-ui-express');
const fs        = require('fs');
const YAML      = require('yaml');
const { ok }    = require('../helpers');

function registerSwaggerRoutes(app, repository) {
  const swaggerDocument = YAML.parse(fs.readFileSync('./operator_wallet_swagger.yaml', 'utf8'));
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  app.get('/whats-in-data', async (req, res) => {
    res.json(ok({ data: await repository.dump() }));
  });
}

module.exports = { registerSwaggerRoutes };
