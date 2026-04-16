/**
 * Markdown Renderer Plugin
 * 
 * Renders VANT brain content as formatted markdown.
 */

function renderLine(line, maxWidth = 60) {
    if (line.length <= maxWidth) return line;
    const words = line.split(' ');
    let result = '';
    let current = '';
    words.forEach(word => {
        if ((current + ' ' + word).length <= maxWidth) {
            current = current ? current + ' ' + word : word;
        } else {
            result += (result ? '\n' : '') + current;
            current = word;
        }
    });
    return result + (current ? '\n' + current : '');
}

function hook(ctx) {
    return {
        name: 'renderer',
        version: '0.5.0',
        
        onLoad(brain) {
            console.log('[Renderer] Ready');
        },
        
        onMessage(msg) {
            if (msg.startsWith('render:')) {
                const key = msg.replace('render:', '').trim();
                if (key === 'all' && ctx.brain) {
                    return Object.keys(ctx.brain).map(k => 
                        `## ${k}\n${ctx.brain[k].slice(0, 200)}`
                    ).join('\n\n');
                }
                return ctx.brain && ctx.brain[key] 
                    ? ctx.brain[key].slice(0, 500) 
                    : `No brain file: ${key}`;
            }
            return null;
        }
    };
}

module.exports = hook;