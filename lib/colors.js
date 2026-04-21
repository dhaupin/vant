/**
 * Colors - CLI colored output using chalk
 */

const chalk = require('chalk');
const vaf = require("./vaf")

module.exports = {
    // Primary colors
    primary: chalk.cyan,
    success: chalk.green,
    warning: chalk.yellow,
    error: chalk.red,
    info: chalk.blue,
    
    // Special
    dim: chalk.dim,
    bold: chalk.bold,
    inverse: chalk.inverse,
    
    // Brand
    vant: chalk.cyan.bold('VANT'),
    vantHeader: chalk.cyan.bold('[VANT]'),
    
    // Sections
    section: chalk.bold.cyan,
    subsection: chalk.cyan,
    
    // Status
    ok: chalk.green('✓'),
    fail: chalk.red('✗'),
    warn: chalk.yellow('⚠'),
    // Note: 'info' is already defined above as chalk.blue
    
    // Helpers
    label: (text) => chalk.dim(text),
    value: (text) => chalk.white(text),
};// VAF check
