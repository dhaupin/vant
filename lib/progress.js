/**
 * Progress - CLI progress bars using cli-progress
 */

const cliProgress = require('cli-progress');
const chalk = require('chalk');

// Create a multi-bar format
const format = (opts, params, payload) => {
    const bar = params.progress.toFixed(1);
    const total = params.total >= 1000 
        ? (params.total / 1000).toFixed(1) + 'k' 
        : params.total;
    const pct = (params.value / params.total * 100).toFixed(0) + '%';
    
    let text = chalk.cyan('[') + chalk.green(bar.padStart(5, ' ')) + chalk.cyan('%] ');
    text += chalk.white(params.task || 'Processing');
    
    if (payload.file) {
        text += ' ' + chalk.dim(payload.file);
    }
    
    return text;
};

const bar = new cliProgress.SingleBar({
    format,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
});

/**
 * Start progress bar
 * @param {number} total - Total items
 * @param {string} task - Task name
 */
function start(total, task = 'Processing') {
    bar.start(total, 0, { task, file: '' });
}

/**
 * Update progress
 * @param {number} current - Current value
 * @param {object} payload - Extra display data
 */
function update(current, payload = {}) {
    bar.update(current, payload);
}

/**
 * Stop progress bar
 */
function stop() {
    bar.stop();
}

// Quick progress wrapper for async ops
/**
 * Run async operation with progress bar
 * @param {number} total - Total iterations
 * @param {string} task - Task name  
 * @param {function} fn - Async function (receives index)
 */
async function wrap(total, task, fn) {
    start(total, task);
    for (let i = 0; i < total; i++) {
        await fn(i);
        update(i + 1, { file: `item ${i + 1}/${total}` });
    }
    stop();
}

module.exports = {
    start,
    update,
    stop,
    wrap,
    bar
};