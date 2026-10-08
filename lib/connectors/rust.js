/**
 * Rust Connector (pass 168)
 * Talk to Rust from Vant via subprocess (rustc single-file compile+run)
 *
 * The sidecar half of this bridge is lib/connectors/rust-srv/ (a compiled
 * srv spawned by lib/sidecar.js — see SidecarConnector). This module is
 * the subprocess fallback: every eval compiles a single-file snippet with
 * rustc (no cargo project, no registry) and runs it.
 *
 * Usage:
 *   const compute = require('../compute');
 *   const result = await compute.evaluate('println!("{}", 2 + 2);', { lang: 'rust' });
 *   console.log(result.stdout);  // "4"
 *
 * Bare statements are wrapped in `fn main()` automatically — pass complete
 * statements, the same contract rust-srv's eval speaks.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { BaseConnector } = require('./base');

class RustConnector extends BaseConnector {
    constructor(options = {}) {
        super(options);
        this.lang = 'rust';
    }

    getLang() {
        return 'rust';
    }

    getCmd() {
        return this._options.rustc || 'rustc';
    }

    /**
     * BaseConnector.execute() spawns cmd+args over a codeOrFile, but Rust
     * has no eval interpreter — every path here is compile-then-run, so
     * eval()/run() own their subprocess lifecycle and getArgs() is only a
     * formality for the BaseConnector interface.
     */
    getArgs(codeOrFile) {
        return ['--edition', '2021', '-O', '-o', this._tmpBin(), codeOrFile];
    }

    _tmpBin() {
        return path.join(os.tmpdir(), 'vant-rust-' + process.pid + '-' + Date.now());
    }

    /**
     * Spawn a process with stdout/stderr capture (BaseConnector.execute
     * semantics, parameterized so compile and run share one implementation).
     */
    _spawn(cmd, args, timeout) {
        const { spawn } = require('child_process');
        return new Promise((resolve, reject) => {
            const proc = spawn(cmd, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env, ...this._options.env }
            });
            let stdout = '', stderr = '';
            proc.stdout.on('data', d => stdout += d);
            proc.stderr.on('data', d => stderr += d);
            const timer = setTimeout(() => {
                proc.kill();
                reject(new Error('rust subprocess timed out after ' + timeout + 'ms'));
            }, timeout);
            proc.on('close', code => {
                clearTimeout(timer);
                resolve({ code, stdout: stdout.trim(), stderr: stderr.trim(), success: code === 0 });
            });
            // (pass 166 pin lesson) ENOENT emits 'error' — handle it or crash.
            proc.on('error', err => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    /**
     * Compile a single-file snippet with rustc and run it.
     * Bare code (no `fn main`) is wrapped in `fn main() { ... }`.
     */
    async eval(code, options = {}) {
        const timeout = options.timeout || 30000;
        const src = code.includes('fn main')
            ? code
            : 'fn main() {\n' + code + '\n}\n';

        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vant-rust-eval-'));
        const srcPath = path.join(dir, 'main.rs');
        const binPath = path.join(dir, 'eval-bin');
        fs.writeFileSync(srcPath, src);

        try {
            const rustc = this.getCmd();
            const compile = await this._spawn(
                rustc, ['--edition', '2021', '-O', '-o', binPath, srcPath], timeout);

            if (!compile.success) {
                return {
                    code: compile.code || 1,
                    stdout: compile.stdout,
                    stderr: compile.stderr || ('rustc exited ' + compile.code),
                    success: false
                };
            }

            return await this._spawn(binPath, [], timeout);
        } finally {
            try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* tmp */ }
        }
    }

    /**
     * Invoke a function — Rust has no runtime reflection; invoke() generates
     * a compilable statement describing the call for the caller to refine.
     */
    async invoke(func, args = {}) {
        const code = `println!("${func}({})", r#${JSON.stringify(args)}#);`;
        return await this.eval(code);
    }

    /**
     * Run a Rust file (compile + execute)
     */
    async run(scriptPath, args = []) {
        const timeout = 30000;
        const binPath = this._tmpBin();
        const compile = await this._spawn(
            this.getCmd(), ['--edition', '2021', '-O', '-o', binPath, scriptPath], timeout);
        if (!compile.success) {
            return {
                code: compile.code || 1,
                stdout: compile.stdout,
                stderr: compile.stderr || ('rustc exited ' + compile.code),
                success: false
            };
        }
        try {
            return await this._spawn(binPath, args, timeout);
        } finally {
            try { fs.rmSync(binPath, { force: true }); } catch (e) { /* tmp */ }
        }
    }

    /**
     * Check rustc availability
     */
    async ping() {
        try {
            const result = await this.eval('println!("{}", 1);', { timeout: 10000 });
            return result.success;
        } catch (e) {
            return false;
        }
    }
}

module.exports = { RustConnector };
