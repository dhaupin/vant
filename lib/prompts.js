/**
 * Prompts - Interactive CLI prompts using Inquirer
 * 
 * Usage:
 *   const prompts = require('./prompts');
 *   
 *   const answers = await prompts.confirm('Continue?');
 *   const repo = await prompts.input('GitHub repo', 'owner/repo');
 *   const branch = await prompts.select('Branch', ['main', 'develop']);
 */

const inquirer = require('inquirer');
const colors = require('./colors');

/**
 * Confirm prompt - Yes/No
 * @param {string} message - Question
 * @param {boolean} defaultVal - Default (default: true)
 */
async function confirm(message, defaultVal = true) {
    const { ok } = await inquirer.prompt([{
        type: 'confirm',
        name: 'ok',
        message: colors.section(message),
        default: defaultVal
    }]);
    return ok;
}

/**
 * Input prompt
 * @param {string} message - Question
 * @param {string} defaultVal - Default value
 * @param {function} validate - Validation function
 */
async function input(message, defaultVal = '', validate = null) {
    const { value } = await inquirer.prompt([{
        type: 'input',
        name: 'value',
        message: colors.section(message),
        default: defaultVal,
        validate: validate || ((v) => v.length > 0 || 'Required')
    }]);
    return value;
}

/**
 * Password prompt
 * @param {string} message - Question
 */
async function password(message = 'Password') {
    const { value } = await inquirer.prompt([{
        type: 'password',
        name: 'value',
        message: colors.section(message),
        validate: (v) => v.length > 0 || 'Required'
    }]);
    return value;
}

/**
 * Select prompt - Choose one
 * @param {string} message - Question
 * @param {array} choices - Options
 * @param {string} defaultVal - Default
 */
async function select(message, choices, defaultVal = null) {
    const { value } = await inquirer.prompt([{
        type: 'list',
        name: 'value',
        message: colors.section(message),
        choices: choices.map(c => ({ name: c, value: c })),
        default: choices.indexOf(defaultVal) >= 0 ? defaultVal : 0
    }]);
    return value;
}

/**
 * Multi-select prompt - Choose multiple
 * @param {string} message - Question
 * @param {array} choices - Options
 * @param {array} defaultVals - Defaults
 */
async function multiSelect(message, choices, defaultVals = []) {
    const { value } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'value',
        message: colors.section(message),
        choices: choices.map(c => ({ name: c, value: c, checked: defaultVals.includes(c) }))
    }]);
    return value;
}

/**
 * Editor prompt - Open in $EDITOR
 * @param {string} message - Question
 * @param {string} defaultVal - Default content
 */
async function editor(message, defaultVal = '') {
    const { value } = await inquirer.prompt([{
        type: 'editor',
        name: 'value',
        message: colors.section(message),
        default: defaultVal
    }]);
    return value;
}

/**
 * Setup wizard - Configure Vant
 */
async function setup() {
    console.log('\n' + colors.vantHeader + ' ' + colors.bold('Setup Wizard') + '\n');
    
    const config = {};
    
    // GitHub repo
    config.repo = await input('GitHub repository (owner/repo)', 'dhaupin/vant');
    
    // Branch
    config.branch = await select('GitHub branch', ['main', 'develop', 'master'], 'main');
    
    // Token (from env or prompt)
    config.token = process.env.GITHUB_TOKEN || await password('GitHub token (or press enter for env)');
    
    // Stegoframe (optional)
    if (await confirm('Enable Stegoframe transport?')) {
        config.stegoRoom = await input('Stegoframe room ID');
        config.stegoPass = await password('Stegoframe passphrase');
    }
    
    // Plugins
    const pluginOptions = ['brain', 'config', 'mood', 'echo', 'renderer'];
    config.plugins = await multiSelect('Enable plugins', pluginOptions, ['brain', 'config']);
    
    console.log('\n' + colors.success('✓') + ' Configuration saved!\n');
    
    return config;
}

module.exports = {
    confirm,
    input,
    password,
    select,
    multiSelect,
    editor,
    setup
};