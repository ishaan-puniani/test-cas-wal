'use strict';

// Backward-compatible alias — the implementation now lives in the repository layer.
// Swap InMemorySimulationQueueRepository for a Redis/Mongo variant without changing callers.
const { InMemorySimulationQueueRepository } = require('./repository/InMemorySimulationQueueRepository');

const SimulationQueue = InMemorySimulationQueueRepository;

module.exports = { SimulationQueue };
