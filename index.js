'use strict';

const { InMemoryWalletRepository }          = require('./src/repository/InMemoryWalletRepository');
const { InMemorySimulationQueueRepository } = require('./src/repository/InMemorySimulationQueueRepository');
const { createApp }                         = require('./src/app');

const repository      = new InMemoryWalletRepository();
const simulationQueue = new InMemorySimulationQueueRepository();
const app             = createApp(repository, simulationQueue);

// Backward-compatible exports — tests use these same names
const IN_MEMORY_WALLET_DATA = repository._data;
const SIMULATIONS_QUEUE     = simulationQueue.queue;
async function resetStore() {
  await repository.reset();
  simulationQueue.clear();
}

module.exports = { app, IN_MEMORY_WALLET_DATA, SIMULATIONS_QUEUE, resetStore };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}/api-docs`));
}

