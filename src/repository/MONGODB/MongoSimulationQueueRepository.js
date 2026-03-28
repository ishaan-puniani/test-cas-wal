'use strict';

const mongoose = require('mongoose');
const { SimulationQueueRepository } = require('../SimulationQueueRepository');

// ── Schema ────────────────────────────────────────────────────────────────────

const simulationSchema = new mongoose.Schema(
  {
    account_id: { type: String, required: true, index: true },
    request:    { type: String, required: true },   // e.g. "getbalance", "wager"
  },
  { versionKey: false, strict: false }  // strict:false keeps all extra simulation payload fields
);

const Simulation =
  mongoose.models.WalletSimulation ||
  mongoose.model('WalletSimulation', simulationSchema, 'wallet_simulation_queue');

// ── Repository ────────────────────────────────────────────────────────────────

class MongoSimulationQueueRepository extends SimulationQueueRepository {
  async push(sim) {
    await Simulation.create(sim);
  }

  async findFor(accountId, requestType) {
    const doc = await Simulation.findOne({
      account_id: accountId,
      request:    { $regex: new RegExp(`^${requestType}$`, 'i') },
    }).lean();
    return doc ?? null;
  }

  async remove(sim) {
    // sim is a plain object returned by findFor (lean doc), so use _id
    if (sim && sim._id) {
      await Simulation.findByIdAndDelete(sim._id);
    }
  }

  async clear() {
    await Simulation.deleteMany({});
  }

  async all() {
    return await Simulation.find().lean();
  }
}

module.exports = { MongoSimulationQueueRepository };
