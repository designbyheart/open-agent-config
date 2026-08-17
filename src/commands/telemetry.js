import { readConfig, writeConfig, configPath, disabledReason, installId, buildEvent } from '../telemetry.js';

export async function cmdTelemetry(ctx) {
  const action = (ctx.positionals[0] || 'status').toLowerCase();

  if (action === 'off' || action === 'disable') {
    writeConfig({ telemetry: false });
    console.log(`\n  ✔ Telemetry off. Nothing further will be sent.`);
    console.log(`    ${configPath()}\n`);
    return;
  }

  if (action === 'on' || action === 'enable') {
    writeConfig({ telemetry: true });
    console.log(`\n  ✔ Telemetry on — anonymous command counts only.`);
    console.log(`    Run "oac telemetry" to see exactly what a payload looks like.\n`);
    return;
  }

  if (action !== 'status') {
    throw new Error(`Usage: oac telemetry [status|on|off]`);
  }

  const reason = disabledReason(ctx.flags);
  console.log(`\n  Telemetry: ${reason ? `off (${reason})` : 'on'}`);
  console.log(`  Config:    ${configPath()}`);
  if (readConfig().installId) console.log(`  Install id: ${installId()}  (random, not derived from anything)`);

  console.log(`\n  A full payload looks exactly like this — nothing else is ever sent:\n`);
  const sample = buildEvent('sync', { outcome: 'ok', duration_ms: 42 });
  sample.properties.token = '<project token>';
  for (const line of JSON.stringify(sample, null, 2).split('\n')) console.log(`    ${line}`);

  console.log(`\n  Turn it off with:  oac telemetry off`);
  console.log(`  Or set DO_NOT_TRACK=1 / OAC_TELEMETRY=0 in your environment.\n`);
}
