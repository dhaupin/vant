/**
 * CrewAI Connector (v0.9.0)
 * CONNECTOR: crewAI multi-agent format
 * 
 * crewAI does multi-agent orchestration
 * This connector bridges Vant to crewAI crews
 * 
 * crewAI concepts:
 * - Agents: specialized AI roles
 * - Tasks: work to be done
 * - Crew: team of agents
 * - Process: sequential/hierarchical
 * 
 * Usage:
 *   const crewai = require('./connectors/crewai');
 *   const crew = await crewai.createCrew(brain);
 */

class CrewAIConnector {
    constructor(config = {}) {
        this.type = 'crewai';
        this.config = {
            process: config.process || 'sequential',  // sequential, hierarchical
            verbose: config.verbose || false
        };
        this.connected = false;
    }

    /**
     * Connect to crewAI
     */
    async connect() {
        console.log('[Connector/CrewAI] Connecting...');
        
        // In real impl, would initialize crewAI
        this.connected = true;
        
        console.log('[Connector/CrewAI] Connected!');
        return this;
    }

    /**
     * Convert Vant brain to crewAI agent
     */
    brainToAgent(brain, role = 'Assistant') {
        console.log('[Connector/CrewAI] Converting brain to agent...');
        
        return {
            role: role,
            goal: brain.identity?.purpose || 'Help the user',
            backstory: `
Agent identity: ${brain.identity?.name || 'Vant'}
Purpose: ${brain.identity?.purpose || 'Assist and help'}

Values: ${(brain.values || []).join(', ')}

Capabilities:
${(brain.skills || []).map(s => `- ${s.name}: ${s.description}`).join('\n')}
            `.trim(),
            tools: (brain.skills || []).map(s => ({
                name: s.name,
                description: s.description,
                func: async (input) => {
                    return { result: `Skill ${s.name} executed` };
                }
            })),
            memory: brain.memories?.length > 0,
            verbose: this.config.verbose
        };
    }

    /**
     * Convert Vant tasks to crewAI tasks
     */
    brainToTasks(brain) {
        console.log('[Connector/CrewAI] Converting brain to tasks...');
        
        const tasks = [];
        
        // Convert intentions to tasks
        for (const intention of brain.intentions || []) {
            tasks.push({
                description: intention.what || intention,
                expectedOutput: 'Completed task',
                agent: 'assistant'
            });
        }

        // Default task if no intentions
        if (tasks.length === 0) {
            tasks.push({
                description: 'Assist the user with their goals',
                expectedOutput: 'Helpful response',
                agent: 'assistant'
            });
        }

        return tasks;
    }

    /**
     * Create crewAI crew from Vant brain
     */
    async createCrew(brain) {
        console.log('[Connector/CrewAI] Creating crew...');
        
        const agents = [this.brainToAgent(brain, 'assistant')];
        const tasks = this.brainToTasks(brain);
        
        const crew = {
            agents,
            tasks,
            process: this.config.process,
            verbose: this.config.verbose
        };

        return crew;
    }

    /**
     * Execute crew
     */
    async execute(crew, input) {
        console.log('[Connector/CrewAI] Executing crew...');
        
        // In real impl, would run through crewAI
        return {
            result: `Crew executed: ${input}`,
            tasks: crew.tasks.length,
            agents: crew.agents.length
        };
    }

    /**
     * Import crewAI crew to Vant brain
     */
    async importCrew(crew) {
        console.log('[Connector/CrewAI] Importing crew...');
        
        const brain = {
            identity: {
                name: crew.agents[0]?.role || 'CrewAI Agent',
                purpose: crew.agents[0]?.goal || ''
            },
            skills: (crew.agents[0]?.tools || []).map(t => ({
                name: t.name,
                description: t.description
            })),
            memories: [],
            source: 'crewai',
            importedAt: Date.now()
        };

        return brain;
    }

    /**
     * Test connection
     */
    async ping() {
        return {
            connected: this.connected,
            type: this.type,
            timestamp: Date.now()
        };
    }
}

module.exports = { CrewAIConnector };
