/**
 * OS (v0.8.6)
 * Agent OS - consolidated utilities + ALL Vant classes
 * 
 * Other agents can use this single entry point
 */

const utils = require('./utils');
const runtime = require('./runtime');
const agents = require('./agents');
const ipc = require('./ipc');
const brain = require('./brain');
const islands = require('./islands');
const vectorStore = require('./vector-store');
const cron = require('./cron');
const conversation = require('./conversation');
const search = require('./search');

// EXISTING CLASSES - expose them directly
const Encrypt = require('./encrypt');
const stego = require('./stego');
const { Auth } = require('./auth');
const vaf = require('./vaf');
const qos = require('./qos');
const Escrow = require('./escrow');
const compression = require('./compression');
const eventBus = require('./event-bus');
const cache = require('./cache');
const context = require('./context');

// Classes
const RateLimiter = qos.RateLimiter;
const CircuitBreaker = qos.CircuitBreaker;
const Bulkhead = qos.Bulkhead;

// Re-export everything
module.exports = {
    // IDENTITY
    init: runtime.init,
    getState: runtime.getState,
    getStatus: runtime.getStatus,
    
    // CORE
    think: runtime.think,
    learn: runtime.learn,
    remember: runtime.remember,
    act: runtime.act,
    getTools: runtime.getTools,
    
    // CLASSES (use directly!)
    Encrypt,
    stego,
    Auth: Auth,
    vaf,
    QoS: qos,
    RateLimiter,
    CircuitBreaker,
    Bulkhead,
    Escrow,
    compression,
    eventBus,
    cache,
    context,
    
    // Encrypt shortcuts
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
    
    // Stego shortcuts
    stegoEncode: stego.encode,
    stegoDecode: stego.decode,
    stegoHasData: stego.hasData,
    stegoEncodeToBuffer: stego.encodeToBuffer,
    stegoDecodeFromBuffer: stego.decodeFromBuffer,
    
    // QoS shortcuts
    rateLimit: (opts) => new RateLimiter(opts),
    circuitBreaker: (name) => new CircuitBreaker(name),
    bulkhead: (opts) => new Bulkhead(opts),
    
    // Search
    queryBrain: search.queryBrain,
    rerank: search.rerank,
    compress: search.compress,
    
    // Islands
    findTriggers: islands.findTriggers,
    autoHydrate: islands.autoHydrate,
    getAvailable: islands.getAvailable,
    
    // Vector Store
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
    cronList: cron.list,
    cronOn: cron.on,
    
    // Conversation
    convCreate: conversation.create,
    convJoin: conversation.join,
    convPost: conversation.post,
    convReply: conversation.reply,
    convMessages: conversation.messages,
    convDelete: conversation.delete,
    convList: conversation.list,
    convExport: conversation.export,
    
    // Agents
    spawnAgent: agents.spawn,
    forkAgent: agents.fork,
    delegate: agents.delegate,
    joinConversation: agents.join,
    emit: agents.emit,
    listAgents: agents.list,
    terminateAgent: agents.terminate,
    
    // IPC
    ipcSend: ipc.send,
    ipcSubscribe: ipc.subscribe,
    ipcPublish: ipc.publish,
    ipcMessages: ipc.messages,
    
    // Utils
    utils,
    
    getLayerStatus: () => ({ name: 'OS', type: 'runtime', version: '0.8.6', enabled: true }),
    isOperationAllowed: () => ({ allowed: true }),
    getStatus: () => ({ enabled: true, components: 18 })
};
