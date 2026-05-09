/**
 * OS (v0.8.6)
 * Agent OS - consolidated utilities exposed
 * 
 * Uses existing Vant classes: Encrypt, stego, auth, event-bus, vaf
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

// EXISTING CLASSES - use these instead of making new!
const Encrypt = require('./encrypt');
const stego = require('./stego');
const { Auth } = require('./auth');
const eventBus = require('./event-bus');
const vaf = require('./vaf');

// Re-export everything cleanly + existing classes
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
    
    // EXISTING CLASSES - use these!
    Encrypt,
    stego,
    Auth: new Auth(),
    eventBus,
    vaf,
    
    // Encrypt API shortcuts
    generateId: Encrypt.generateId,
    encrypt: Encrypt.encrypt,
    decrypt: Encrypt.decrypt,
    hash: Encrypt.hash,
    sha256: Encrypt.sha256,
    md5: Encrypt.md5,
    hmac: Encrypt.hmac,
    hmacSign: Encrypt.hmacSign,
    hmacVerify: Encrypt.hmacVerify,
    aesGcmEncrypt: Encrypt.aesGcmEncrypt,
    aesGcmDecrypt: Encrypt.aesGcmDecrypt,
    encode: Encrypt.encode,
    decode: Encrypt.decode,
    
    // Stego API shortcuts
    stegoEncode: stego.encode,
    stegoDecode: stego.decode,
    stegoHasData: stego.hasData,
    stegoEncodeToBuffer: stego.encodeToBuffer,
    stegoDecodeFromBuffer: stego.decodeFromBuffer,
    
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
    getStatus: () => ({ enabled: true, components: 18 })
};
