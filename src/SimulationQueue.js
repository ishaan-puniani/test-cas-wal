'use strict';

class SimulationQueue {
  constructor() { this.queue = []; }

  push(sim)  { this.queue.push(sim); }

  // Match by both account_id AND request type (prevents leaking sims across ops)
  findFor(accountId, requestType) {
    return this.queue.find(
      s => s.account_id === accountId && s.request?.toLowerCase() === requestType
    );
  }

  remove(sim) { this.queue.splice(this.queue.indexOf(sim), 1); }
  clear()     { this.queue.length = 0; }
  all()       { return this.queue; }
}

module.exports = { SimulationQueue };
