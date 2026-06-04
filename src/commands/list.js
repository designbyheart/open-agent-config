import { loadSkills, loadStacks } from '../catalog.js';
import { allTargets } from '../targets/registry.js';

export async function cmdList(ctx) {
  const what = ctx.positionals[0] || 'all';

  if (what === 'targets' || what === 'all') {
    console.log('\n  Targets (agents / editors):');
    for (const t of allTargets()) {
      console.log(`    ${t.id.padEnd(10)} ${t.label}`);
    }
  }

  if (what === 'skills' || what === 'all') {
    const skills = loadSkills().filter((s) => s.id !== '_example');
    console.log('\n  Skills:');
    if (!skills.length) {
      console.log('    (none yet — add folders under catalog/skills/)');
    } else {
      for (const s of skills) console.log(`    ${s.id.padEnd(16)} ${s.description}`);
    }
  }

  if (what === 'stacks' || what === 'all') {
    const stacks = loadStacks();
    console.log('\n  Stacks:');
    if (!stacks.length) {
      console.log('    (none)');
    } else {
      for (const s of stacks) console.log(`    ${s.id.padEnd(16)} ${s.label}`);
    }
  }
  console.log('');
}
