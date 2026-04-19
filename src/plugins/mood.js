/**
 * Mood Plugin
 * 
 * Manages VANT's mood state.
 * Can be overridden via settings or runtime strings.
 * 
 * Usage:
 *   mood.set('focused')
 *   mood.get()
 *   mood.transition(event)
 */

const fs = require('fs');
const path = require('path');

const MOOD_FILE = path.join(__dirname, '../../mood.ini');

const MOODS = {
    focused: { energy: 'high', sociability: 'medium', emoji: '🎯' },
    curious: { energy: 'high', sociability: 'high', emoji: '🤔' },
    playful: { energy: 'high', sociability: 'high', emoji: '😎' },
    cautious: { energy: 'medium', sociability: 'low', emoji: '⚠️' },
    urgent: { energy: 'high', sociability: 'low', emoji: '🔥' },
    contemplative: { energy: 'low', sociability: 'medium', emoji: '🌊' },
    neutral: { energy: 'medium', sociability: 'medium', emoji: '😐' }
};

let currentMood = 'neutral';
let idleTime = 0;
let messageCount = 0;

function getMood() {
    return currentMood;
}

function setMood(moodName) {
    if (!MOODS[moodName]) {
        throw new Error(`Unknown mood: ${moodName}. Valid: ${Object.keys(MOODS).join(', ')}`);
    }
    currentMood = moodName;
    saveMood();
    return { mood: moodName, ...MOODS[moodName] };
}

function getMoodData() {
    return MOODS[currentMood] || MOODS.neutral;
}

/**
 * Parse mood from input string
 * Format: "mood:curious" anywhere in input
 */
function parseMoodFromInput(input) {
    const match = input.match(/mood:(\w+)/i);
    if (match && MOODS[match[1].toLowerCase()]) {
        return match[1].toLowerCase();
    }
    return null;
}

/**
 * Auto-transition mood based on events
 */
function transition(event) {
    switch (event) {
        case 'success':
            setMood('playful');
            break;
        case 'fail':
            setMood('cautious');
            break;
        case 'idle':
            idleTime++;
            if (idleTime > 10) setMood('neutral');
            break;
        case 'message':
            messageCount++;
            if (messageCount > 100) setMood('contemplative');
            break;
    }
}

function saveMood() {
    const content = `=== VANT MOOD ===

MOOD=${currentMood}
ENERGY=${getMoodData().energy}
SOCIABILITY=${getMoodData().sociability}
LAST_UPDATE=${new Date().toISOString()}
`;
    fs.writeFileSync(MOOD_FILE, content);
}

function loadMood() {
    if (fs.existsSync(MOOD_FILE)) {
        const content = fs.readFileSync(MOOD_FILE, 'utf8');
        const match = content.match(/MOOD=(\w+)/);
        if (match && MOODS[match[1]]) {
            currentMood = match[1];
        }
    }
}

// Initialize
loadMood();

module.exports = {
    get: getMood,
    set: setMood,
    getData: getMoodData,
    parse: parseMoodFromInput,
    transition,
    MOODS
};