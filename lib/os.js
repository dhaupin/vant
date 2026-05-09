/**
 * OS (v0.8.6)
 * Agent OS - consolidated utilities exposed
 * 
 * Other agents can use these to join Vant
 */

const utils = require('./utils');
const runtime = require('./runtime');
const agents = require('./agents');
const ipc = require('./ipc');
const brain = require('./brain');
const search = require('./search');
const islands = require('./islands');
const vectorStore = require('./vector-store');
const cron = require('./cron');
const conversation = require('./conversation');

// Re-export everything cleanly
module.exports = {
    // Identity
    init: runtime.init,
    
    // Core runtime
    think: runtime.think,
    learn: runtime.learn,
    remember: runtime.remember,
    act: runtime.act,
    getTools: runtime.getTools,
    getState: runtime.getState,
    getStatus: runtime.getStatus,
    
    // Multi-agent
    spawnAgent: agents.spawn,
    forkAgent: agents.fork,
    delegate: agents.delegate,
    joinConversation: agents.join,
    emit: agents.emit,
    on: agents.on,
    listAgents: agents.list,
    getAgent: agents.get,
    terminateAgent: agents.terminate,
    
    // IPC
    ipcSend: ipc.send,
    ipcSubscribe: ipc.subscribe,
    ipcPublish: ipc.publish,
    ipcMessages: ipc.messages,
    ipcClear: ipc.clear,
    
    // Brain
    brainGet: brain.get,
    brainWrite: brain.write,
    brainAppend: brain.append,
    brainHas: brain.has,
    brainQuery: brain.queryBrain,
    
    // Search
    queryBrain: search.queryBrain,
    rerank: search.rerank,
    compress: search.compress,
    
    // Islands
    findTriggers: islands.findTriggers,
    autoHydrate: islands.autoHydrate,
    getAvailable: islands.getAvailable,
    
    // Vector Store (local embeddings - no external API)
    vectorAdd: vectorStore.add,
    vectorSearch: vectorStore.search,
    vectorGet: vectorStore.get,
    vectorRemove: vectorStore.remove,
    vectorClear: vectorStore.clear,
    vectorCount: vectorStore.count,
    
    // Cron
    schedule: cron.schedule,
    cancel: cron.cancel,
    runTask: cron.run,
    cronStatus: cron.status,
    cronList: cron.list,
    cronEnable: cron.enable,
    cronOn: cron.on,
    
    // Conversation
    convCreate: conversation.create,
    convJoin: conversation.join,
    convPost: conversation.post,
    convReply: conversation.reply,
    convMessages: conversation.messages,
    convInfo: conversation.info,
    convDelete: conversation.delete,
    convList: conversation.list,
    convExport: conversation.export,
    
    // Utils
    utils,
    
    getLayerStatus: () => ({ name: 'OS', type: 'runtime', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, components: 14 })
};
