'use strict';

require('dotenv').config();

const { createApp } = require('./src/app');

// ── Repository factory ────────────────────────────────────────────────────────

const MEMORY_TO_USE = (process.env.MEMORY_TO_USE || 'IN_MEMORY').trim().toUpperCase();

let repository;
let simulationQueue;
let connectToDb = async () => {};   // no-op for in-memory

if (MEMORY_TO_USE === 'MONGODB') {
  const mongoose = require('mongoose');
  const { MongoWalletRepository }          = require('./src/repository/MONGODB/MongoWalletRepository');
  const { MongoSimulationQueueRepository } = require('./src/repository/MONGODB/MongoSimulationQueueRepository');

  repository      = new MongoWalletRepository();
  simulationQueue = new MongoSimulationQueueRepository();

  connectToDb = async () => {
    const uri = process.env.DATABASE_CONNECTION;
    if (!uri) throw new Error('DATABASE_CONNECTION is not set in environment');
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
  };
} else {
  const { InMemoryWalletRepository }          = require('./src/repository/IN_MEMORY/InMemoryWalletRepository');
  const { InMemorySimulationQueueRepository } = require('./src/repository/IN_MEMORY/InMemorySimulationQueueRepository');
  repository      = new InMemoryWalletRepository();
  simulationQueue = new InMemorySimulationQueueRepository();
}

const app = createApp(repository, simulationQueue);

// ── Backward-compatible exports (tests reference these) ──────────────────────

// IN_MEMORY_WALLET_DATA and SIMULATIONS_QUEUE only make sense for in-memory.
// For MongoDB they are left as empty stubs so existing test imports don't crash;
// test suites that use MEMORY_TO_USE=MONGODB should use the repository API directly.
const IN_MEMORY_WALLET_DATA = repository._data ?? { accounts: {}, sessions: {}, transactions: [] };
const SIMULATIONS_QUEUE     = simulationQueue.queue ?? [];

async function resetStore() {
  await repository.reset();
  await simulationQueue.clear();
}

module.exports = { app, IN_MEMORY_WALLET_DATA, SIMULATIONS_QUEUE, resetStore };

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  connectToDb()
    .then(() => app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}/api-docs`)))
    .catch(err => { console.error('Startup failed:', err); process.exit(1); });
}

