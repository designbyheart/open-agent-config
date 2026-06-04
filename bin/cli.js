#!/usr/bin/env node
import { run } from '../src/index.js';

run(process.argv.slice(2)).catch((err) => {
  console.error(`\n  ✖ ${err && err.message ? err.message : err}`);
  if (process.env.OAC_DEBUG) console.error(err);
  process.exit(1);
});
