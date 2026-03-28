'use strict';

const { ok, err } = require('../helpers');

function registerSimulationRoutes(app, simulationQueue, repository) {
  app.get('/clear-simulations', async (req, res) => {
    await simulationQueue.clear();
    res.json(ok({ message: 'Simulations queue cleared', SIMULATIONS_QUEUE: await simulationQueue.all() }));
  });

  app.get('/add-in-simulation-queue', async (req, res) => {
    const simulation = req.query;
    if (!simulation.account_id || !simulation.request)
      return res.json(err(1008, 'Parameter Required', 'missing_parameter'));
    await simulationQueue.push(simulation);
    res.json(ok({ message: 'Simulation added to queue', SIMULATIONS_QUEUE: await simulationQueue.all() }));
  });

  app.get('/reset-store', async (req, res) => {
    await repository.reset();
    await simulationQueue.clear();
    res.json(ok({ message: 'Store reset', data: await repository.dump() }));
  });
}

module.exports = { registerSimulationRoutes };
