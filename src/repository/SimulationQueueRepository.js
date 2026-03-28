'use strict';

// Abstract port — implement with InMemorySimulationQueueRepository for dev/test,
// or a RedisSimulationQueueRepository / MongoSimulationQueueRepository for production.
class SimulationQueueRepository {
  async push(sim)                       { throw new Error('not implemented'); }
  async findFor(accountId, requestType) { throw new Error('not implemented'); }
  async remove(sim)                     { throw new Error('not implemented'); }
  async clear()                         { throw new Error('not implemented'); }
  async all()                           { throw new Error('not implemented'); }
}

module.exports = { SimulationQueueRepository };
