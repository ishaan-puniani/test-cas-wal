'use strict';

const { SimulationQueueRepository } = require('./SimulationQueueRepository');

class InMemorySimulationQueueRepository extends SimulationQueueRepository {
  constructor() {
    super();
    this.queue = [];
  }

  async push(sim) { this.queue.push(sim); }

  // Match by both account_id AND request type (prevents leaking sims across ops)
  async findFor(accountId, requestType) {
    return this.queue.find(
      s => s.account_id === accountId && s.request?.toLowerCase() === requestType
    ) ?? null;
  }

  async remove(sim) { this.queue.splice(this.queue.indexOf(sim), 1); }
  async clear()     { this.queue.length = 0; }
  async all()       { return [...this.queue]; }
}

module.exports = { InMemorySimulationQueueRepository };
