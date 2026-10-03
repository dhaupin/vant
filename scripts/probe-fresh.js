const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = process.cwd();
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-probe-'));
fs.cpSync(path.join(ROOT, 'bin'), path.join(sandbox, 'bin'), { recursive: true });
fs.cpSync(path.join(ROOT, 'lib'), path.join(sandbox, 'lib'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(sandbox, 'package.json'));
for (const f of ['config.example.ini', '.env.example', 'docker-compose.yml']) {
  fs.copyFileSync(path.join(ROOT, f), path.join(sandbox, f));
}
const cwd = path.join(sandbox, 'run-here');
fs.mkdirSync(cwd);
const out = execFileSync('node', [path.join(sandbox, 'bin', 'vant.js'), 'test-all'], { cwd, encoding: 'utf8' });
console.log('--- test-all ---');
console.log(out.split('\n').filter(l => /Passed|✗/.test(l)).join('\n'));
const out2 = execFileSync('node', [path.join(sandbox, 'bin', 'vant.js'), 'format-test'], { cwd, encoding: 'utf8' });
console.log('--- format-test ---');
console.log(out2.split('\n').filter(l => /❌|Results/.test(l)).join('\n'));
fs.rmSync(sandbox, { recursive: true, force: true });
