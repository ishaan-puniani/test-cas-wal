'use strict';

// Force in-memory repositories during tests.
// This runs before any test module is required, so when index.js calls
// dotenv.config() it will NOT override this already-set env var
// (dotenv.config() never overrides existing process.env entries by default).
process.env.MEMORY_TO_USE = 'IN_MEMORY';
