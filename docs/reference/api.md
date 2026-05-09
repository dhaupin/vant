---
version: 0.8.6
permalink: /reference/api
layout: default
title: Module API
nav_order: 3
---
# Module API

## lib/config.js
Load configuration.

```javascript
const config = require('./lib/config');

config.get('github.repo');
config.get('paths.models');
config.set('node.pollInterval', 30);
```

## lib/brain.js
Brain file structure and management.

```javascript
const brain = require('./lib/brain');

await brain.load();      // Load all brain files
await brain.get(key);  // Get file content
await brain.set(key, content); // Set file content
await brain.save();   // Save to disk
```

## lib/lock.js
Manage locks (agent isolation).

```javascript
const lock = require('./lib/lock');

await lock.acquire(agentId);
await lock.release(agentId, token);
const status = lock.status();
```

## lib/brain.js
Persistent agent brain with framework hooks.

```javascript
const brain = require('./lib/brain');

// Module functions
const { version, brain } = brain.load();

// Class interface
const b = brain.create({ autoLoad: true });
await b.load();
const token = await b.acquireBrainLock();
b.write('learnings', 'key', '# content');
await b.releaseBrainLock(token);

// Or use withLock helper
await brain.withLock(async () => {
    brain.write('learnings', 'key', '# content');
});

// Framework hooks
brain.getLayerStatus();
brain.isOperationAllowed('write', {requireLock: true});

// Save
brain.toJSON();
brain.compress();
```

## lib/branch.js
Manage branches.

```javascript
const branch = require('./lib/branch');

branch.currentBranch();
branch.checkout(branchName);
branch.commit(agentId, message);
```

## lib/vaf.js
Validate inputs.

```javascript
const vaf = require('./lib/vaf');

// Validation
vaf.validate(input);                    // Throws on invalid
vaf.check(input, {type: 'string', maxLength: 50000}); // Check with rules

// Different types
vaf.check(input, {type: 'path'});              // File path - blocks traversal
vaf.check(content, {type: 'string', skipDangerous: true}); // Skip content check (for memory)
vaf.checkPathTraversal('../etc/passwd'); // Check path traversal
vaf.checkContent('<script>');            // Check for injection
vaf.checkFileExtension('file.exe');      // Check dangerous extensions

// Rate limiting
vaf.checkRateLimit(ip);                  // Check if IP is rate limited
vaf.isBlocked(ip);                       // Check if IP is blocked
vaf.recordFailedAttempt(ip);             // Record failed attempt
vaf.getStatus();                         // Get VAF status

// Sanitization
vaf.sanitize(input);                     // Remove dangerous content

// Middleware
vaf.middleware(req, res, next);          // Express middleware

// Admin
vaf.reset();                             // Reset all limits
```

## lib/health.js
Health checks.

```javascript
const health = require('./lib/health');

await health.run();        // Run all checks
const status = await health.check(); // Get status
```

## lib/logger.js
Logging.

```javascript
const logger = require('./lib/logger');

logger.info('message');
logger.warn('warning');
logger.error('error');
```

## lib/version.js
Version management.

```javascript
const version = require('./lib/version');

version.get();    // Get current version
version.bump('patch'); // Bump version
```

## lib/succession.js
Version tracking and brain inheritance.

```javascript
const succession = require('./lib/succession');

await succession.get();     // Get current version
await succession.trust();   // Mark trusted
await succession.diff();    // Compare to previous
```

## lib/protection.js
Protect sensitive data.

```javascript
const protection = require('./lib/protection');

// Circuit breaker
protection.enable();   // Enable circuit breaker
protection.disable(); // Disable
protection.trigger();  // Trigger protection mode
protection.getStatus(); // Get protection status

// Active request tracking
protection.incrementActive();  // Track new request
protection.decrementActive();  // Release request
protection.getActiveCount();   // Get active count
protection.canProceed();       // Check if can accept more

// Input size limits
protection.getMaxInputSize();    // Get max size
protection.checkInputSize(data); // Check size

// Failure tracking
protection.recordFailure(ip);      // Record failure
protection.getFailureCount(ip);   // Get failure count
protection.isCircuitOpen();       // Check if circuit open
protection.getCircuitStatus();    // Get full status
protection.resetCircuit();         // Reset circuit
```

## lib/rate-limit.js
Rate limiting.

```javascript
const rateLimit = require('./lib/rate-limit');

await rateLimit.check();    // Check remaining
await rateLimit.wait();    // Wait if needed
rateLimit.getResetTime();  // Get reset time
```

## lib/auto-update.js
Auto-save on exit.

```javascript
const autoUpdate = require('./lib/auto-update');

autoUpdate.enable();    // Enable auto-save
autoUpdate.disable();  // Disable
autoUpdate.trigger();  // Trigger save
```

## lib/onboard.js
Onboard new agents to your brain.

```javascript
const onboard = require('./lib/onboard');

await onboard.query('question');
await onboard.list();    // List available
```

## lib/errors.js
Error codes and troubleshooting.

```javascript
const errors = require('./lib/errors');

errors.handle(error, 'context');  // Handle error with context

// Wrapping helpers
errors.configError('message');       // Wrap config error
errors.githubError('message', 404); // Wrap GitHub error
errors.networkError('message');   // Wrap network error

// Retry
await errors.retry(fn, 3, 1000);   // Retry with backoff

// Get error info
errors.get(code);                 // Get error by code
errors.format(error);             // Format error message
```

## lib/load.js
Load brain files.

```javascript
const load = require('./lib/load');

await load.files();      // Load all files
await load.file(path);  // Load single file
```

## lib/colors.js
Terminal colors.

```javascript
const colors = require('./lib/colors');

// Primary colors
colors.error('message');    // Red
colors.warning('message');  // Yellow
colors.success('message');  // Green
colors.info('message');     // Blue
colors.primary('message');  // Cyan

// Styling
colors.bold('message');
colors.dim('message');
colors.inverse('message');

// Brand
colors.vant;           // Bold cyan VANT
colors.vantHeader;     // [VANT] header

// Sections
colors.section('title');
```

## lib/progress.js
Progress bars.

```javascript
const progress = require('./lib/progress');

progress.start(total);
progress.update(current);
progress.complete();
```

## lib/prompts.js
Interactive prompts.

```javascript
const prompts = require('./lib/prompts');

// Interactive prompts
const confirmed = await prompts.confirm('Continue?');
const name = await prompts.input('Your name');
const password = await prompts.password('Password');
const choice = await prompts.select('Choose:', ['a', 'b', 'c']);
const choices = await prompts.checkbox('Select:', ['a', 'b', 'c']);
```

## lib/verbosity.js
Configure verbosity.

```javascript
const verbosity = require('./lib/verbosity');

// Get verbosity level
verbosity.get();           // Get all levels
verbosity.get('content');   // Get specific: log, response, content, comment, code
verbosity.isVerbose('content'); // Check if verbose

// Set verbosity
verbosity.set('content', 'extended');
verbosity.set({ content: 'extended', response: 'terse' });

// Adjust
verbosity.increase('log');
verbosity.decrease('log');

// Output helpers
verbosity.log('message');        // Respects log= setting
verbosity.response('message');    // Respects response= setting
verbosity.content('message');     // Respects content= setting
```

## lib/stego.js
Steganography.

```javascript
const stego = require('./lib/stego');

stego.encode(message, image);
stego.decode(image);
```

## lib/notifications.js
Send notifications.

```javascript
const notifications = require('./lib/notifications');

notifications.send('title', 'message');
notifications.list();
```

## lib/metrics.js
Track metrics.

```javascript
const metrics = require('./lib/metrics');

metrics.increment('vant.sync.success');
metrics.gauge('vant.memory.usage', 256);
metrics.timing('vant.sync.duration', 1234);
```

## lib/resolution.js
How Vant handles brain conflicts and resolution.

```javascript
const resolution = require('./lib/resolution');

resolution.getStatus('fears', 'fear of X');
resolution.resolve('fears', 'fear of X', 'resolved', 'therapy');
resolution.deprecate('goals', 'old goal', 'new goal');
resolution.reject('identity', 'old belief', 'ethics changed');
resolution.getLedger();
```

## lib/telegram.js
Telegram bot.

```javascript
const telegram = require('./lib/telegram');

telegram.onCommand('status', async (msg) => {
    await telegram.send(msg.chat, 'VANT is running');
});
telegram.onMessage(async (msg) => {
    console.log('Received:', msg.text);
});
await telegram.startPolling();
```

## lib/entropy.js
Entropy Patching protocol for token-aware latent transport. Transforms Vant from "Context Storage" to "Latent Transport".

```javascript
const entropy = require('./lib/entropy');

// Generate patches from binary data
const patches = entropy.generatePatches(buffer, {
    windowSize: 8,
    threshold: 0.85,
});

// Create .vpatch file
const vpatch = await entropy.generateVPatch(inputFile, outputPath, options);

// Reconstruct from patches (lossless)
const hydrated = entropy.hydratePatches(patches);

// Get entropy statistics
const stats = entropy.getEntropyStats(buffer);
// { overall, min, max, mean, chunkCount, byteCount }
```

**CLI:** `vant compress <file> --stats`, `vant compress <file>`, `vant compress <file> -d`

## lib/update-check.js
Check for updates.

```javascript
const updateCheck = require('./lib/update-check');

const hasUpdate = await updateCheck.checkForUpdate();
const latest = await updateCheck.getLatestVersion();
await updateCheck.notifyIfUpdate();
```

See also: [CLI Commands](reference/cli), [Schema](reference/schema)
## MCP Tools

Vant exposes 21 MCP tools for agent integrations:

### Core Tools (9)
| Tool | Description |
|------|-------------|
| vant_get_memory | Read brain files |
| vant_set_memory | Write brain files |
| vant_list_branches | List Git branches |
| vant_create_branch | Create branch |
| vant_switch_branch | Switch branch |
| vant_commit | Commit changes |
| vant_sync | Push/pull |
| vant_lock | Lock brain |
| vant_health | System health |

### Extended Tools (11)
| Tool | Description |
|------|-------------|
| vant_get_islands | List islands |
| vant_load_island | Load island |
| vant_resolution_track | Track decisions |
| vant_stego_encode | Encode PNG stego |
| vant_stego_decode | Decode PNG stego |
| vant_config_get | Get config |
| vant_config_set | Set config |
| vant_audit_log | Log audit entry |
| vant_audit_list | List audit |
| vant_succession_info | Get trust config |
| vant_search | Search brain |

## Core Framework APIs

### lib/framework.js

Unified 6-layer framework: VAF → Sandbox → QoS → Security → API → Escrow

```javascript
const framework = require('./lib/framework');

await framework.init();
const result = await framework.execute(
  () => brain.get('learnings', 'lesson-1'),
  { type: 'read' }
);
console.log(framework.getStatus());
```

### lib/env.js

Unified environment variable handling for all VANT_*, GITHUB, LINEAR env vars.

```javascript
const env = require('./lib/env');

env.githubToken();      // GITHUB_TOKEN
env.githubRepo();      // GITHUB_REPO
env.linearApiKey();     // LINEAR_API_KEY
env.vibe();            // Current vibe setting
env.platform();       // node, cloudflare, vercel, etc
env.mcpPort();        // MCP port (default 3100)
```

### lib/api.js

HTTP API server with auth middleware.

```javascript
const api = require('./lib/api');

await api.start(3000);
api.onRequest(handler);
api.authenticate(context);
```

### lib/vibe.js

Runtime mood control system.

```javascript
const vibe = require('./lib/vibe');

vibe.getMood();           // Get current
vibe.setMood('focused'); // Set mood
vibe.onTaskError();      // Adjust on outcome
vibe.getCommitVibe();    // Get commit message suffix
```

### lib/sync.js

Multi-provider brain sync.

```javascript
const sync = require('./lib/sync');

await sync.pullAll();    // Pull all repos
await sync.pushAll();   // Push all repos
sync.isRAID();          // RAID mode check
```

### lib/search.js

Search brain files (basic/rag/hybrid).

```javascript
const search = require('./lib/search');

const results = await search.basic('query');
const results = await search.rag('semantic query');
const results = await search.hybrid('query');
```

### lib/webhooks.js

Webhook server and triggers.

```javascript
const webhooks = require('./lib/webhooks');

webhooks.startServer(3456);
webhooks.register('sync', handler);
webhooks.trigger('commit', data);
```

## Infrastructure APIs

### lib/sandbox.js

Sandbox isolation for code execution.

```javascript
const sandbox = require('./lib/sandbox');

const result = await sandbox.execute(code, { timeout: 5000 });
sandbox.clearCache();
```

### lib/security.js

Security validation and protection.

```javascript
const security = require('./lib/security');

security.isOperationAllowed(op, context);
security.validateInput(input, rules);
security.getThreatLevel();
```

### lib/error-handler.js

Error handling and logging.

```javascript
const errorHandler = require('./lib/error-handler');

errorHandler.handle(error, context);
errorHandler.getErrorCode(error);
errorHandler.isRetryable(error);
```

### lib/escrow.js

Authentication middleware.

```javascript
const escrow = require('./lib/escrow');

escrow.authenticate(context);
escrow.requireApiKey(headers);
escrow.setSecret(secret);
```

### lib/server.js

HTTP API server.

```javascript
const server = require('./lib/server');

await server.start(port);
server.get(path, handler);
server.post(path, handler);
```

### lib/service-container.js

Dependency injection container.

```javascript
const container = require('./lib/service-container');

container.register('name', factory);
container.get('name');
container.inject(target);
```

### lib/session.js

Session management.

```javascript
const session = require('./lib/session');

session.create(options);
session.get(id);
session.destroy(id);
```

### lib/session_store.js

Session storage backend.

```javascript
const store = require('./lib/session_store');

store.save(session);
store.load(id);
store.destroy(id);
```

## API & HTTP

### lib/router.js (DEPRECATED)

HTTP route matching and dispatch.

```javascript
const router = require('./lib/router');

router.get(path, handler);
router.post(path, handler);
router.route(method, path);
```

### lib/server.js - Inner Classes

HTTP classes now consolidated into Server.

```javascript
const { Server, Request, Response, Router, Static } = require('./lib/server');

// Request
const req = new Request();
req.url('/test').method('POST').body({ data: 1 });

// Response
const res = new Response();
res.status(201).send({ ok: true });

// Router
const router = new Router();
router.get('/api/:id', async (p) => ({ id: p.id }));

// Server.Static
const staticHandler = new Static({ root: 'public' });

// Server with route/static convenience
const server = new Server();
server.route('/api/:id', async (ctx) => ({ id: ctx.id }), 'get');
server.static('public', { index: 'index.html' });
```

Deprecated separate exports now available via Server inner classes.
### lib/request.js (DEPRECATED)

HTTP request abstraction.

```javascript
const request = require('./lib/request');

const req = new Request(httpIncoming);
req.method;    // GET, POST, etc
req.params;    // Route params
req.query;     // Query string
req.body;      // Parsed body
```

### lib/response.js (DEPRECATED)

HTTP response builder.

```javascript
const response = require('./lib/response');

const res = new Response();
res.status(200).json({ data });
res.status(404).send('Not found');
```

### lib/body-parser.js

Parse JSON/form/multipart bodies.

```javascript
const bodyParser = require('./lib/body-parser');

bodyParser.json();
bodyParser.form();
bodyParser.multipart();
```

### lib/cors.js

Cross-origin resource sharing.

```javascript
const cors = require('./lib/cors');

cors.middleware(options);
cors.setOrigin(origin);
cors.getAllowedMethods();
```

## Network & WebSocket

### lib/http.js

HTTP client/server utilities.

```javascript
const http = require('./lib/http');

http.get(url, options);
http.post(url, data, options);
http.request(options);
```

### lib/https.js

HTTPS client (TLS/SSL).

```javascript
const https = require('./lib/https');

https.get(url, options);
https.request(cert, key);
```

### lib/websocket.js

WebSocket server/client.

```javascript
const websocket = require('./lib/websocket');

websocket.createServer(options);
websocket.connect(url);
websocket.broadcast(message);
```

### lib/socket-io.js

Socket.IO real-time communication.

```javascript
const socketIo = require('./lib/socket-io');

const io = socketIo(server);
io.on('connection', socket);
io.emit('event', data);
```

### lib/ip-filter.js

IP address filtering.

```javascript
const ipFilter = require('./lib/ip-filter');

ipFilter.allow(ip);
ipFilter.block(ip);
ipFilter.isAllowed(ip);
```

### lib/helmet.js

Security headers middleware.

```javascript
const helmet = require('./lib/helmet');

helmet.contentSecurityPolicy();
helmet.hsts();
helmet.middleware();
```

## Data & Storage

### lib/cache.js

In-memory cache.

```javascript
const cache = require('./lib/cache');

cache.set(key, value, ttl);
cache.get(key);
cache.delete(key);
```

### lib/lru.js

Least Recently Used cache.

```javascript
const lru = require('./lib/lru');

const store = new LRU(100);
store.set(key, value);
store.get(key);
```

### lib/pool.js

Connection pool.

```javascript
const pool = require('./lib/pool');

pool.acquire();
pool.release(connection);
pool.destroy();
```

### lib/buffer.js

Buffer utilities.

```javascript
const buffer = require('./lib/buffer');

buffer.from(array);
buffer.toString();
buffer.concat(buffers);
```

### lib/transformer.js

Data transformation pipeline.

```javascript
const transformer = require('./lib/transformer');

transformer.pipe(down1, up1).pipe(down2, up2);
transformer.transform(data);
transformer.restore(data);
```

### lib/serializer.js

Object serialization.

```javascript
const serializer = require('./lib/serializer');

serializer.serialize(obj);
serializer.deserialize(data);
serializer.options(options);
```

### lib/storage.js

Persistent storage.

```javascript
const storage = require('./lib/storage');

storage.set(key, value);
storage.get(key);
storage.delete(key);
```

### lib/query-builder.js

SQL query builder.

```javascript
const query = require('./lib/query-builder');

query.select('*').from('table').where({ id: 1 });
query.insert('table', data);
query.update('table', data).where({ id: 1 });
```

## QoS & Flow Control

### lib/debouncer.js

Debounce rapid events.

```javascript
const debouncer = require('./lib/debouncer');

debouncer.debounce(fn, delay);
debouncer.pending();
debouncer.cancel();
```

### lib/throttler.js

Throttle request rate.

```javascript
const throttler = require('./lib/throttler');

throttler.throttle();
throttler.allow();
throttler.getCount();
```

### lib/rate-limiter.js

Rate limiting.

```javascript
const rateLimiter = require('./lib/rate-limiter');

rateLimiter.check(key, limit, window);
rateLimiter.increment(key);
rateLimiter.reset(key);
```

### lib/circuit-breaker.js

Circuit breaker pattern.

```javascript
const circuit = require('./lib/circuit-breaker');

circuit.execute(fn);
circuit.getState();  // closed, open, half-open
circuit.reset();
```

### lib/retry.js

Retry with backoff.

```javascript
const retry = require('./lib/retry');

retry.execute(fn, { attempts: 3, backoff: 'exponential' });
retry.isRetryable(error);
retry.getAttempt();
```

### lib/bulkhead.js

Bulkhead pattern (concurrency limit).

```javascript
const bulkhead = require('./lib/bulkhead');

bulkhead.execute(fn);
bulkhead.getQueueLength();
bulkhead.isRejected();
```

### lib/cache-control.js

HTTP Cache-Control headers.

```javascript
const cacheControl = require('./lib/cache-control');

cacheControl.header(maxAge, options);
cacheControl.parse(header);
cacheControl.isFresh(entry);
```

## Events & Messaging

### lib/event-emitter.js

Event emitter.

```javascript
const emitter = require('./lib/event-emitter');

emitter.on('event', handler);
emitter.emit('event', data);
emitter.off('event', handler);
```

### lib/event-bus.js

Event bus for pub/sub.

```javascript
const eventBus = require('./lib/event-bus');

eventBus.subscribe(topic, handler);
eventBus.publish(topic, data);
eventBus.unsubscribe(handler);
```

### lib/pubsub.js

Pub/Sub messaging.

```javascript
const pubsub = require('./lib/pubsub');

pubsub.subscribe(channel, handler);
pubsub.publish(channel, message);
pubsub.unsubscribe(channel);
```

### lib/pipeline.js

Pipeline processing.

```javascript
const pipeline = require('./lib/pipeline');

pipeline.use(middleware);
pipeline.execute(data);
pipeline.abort();
```

### lib/queue.js

Job queue.

```javascript
const queue = require('./lib/queue');

queue.enqueue(job);
queue.dequeue();
queue.size();
```

### lib/job_worker.js

Background job worker.

```javascript
const worker = require('./lib/job_worker');

worker.start();
worker.process(job);
worker.stop();
```

## Brain Specific

### lib/islands.js

Brain islands (componentized brain).

```javascript
const islands = require('./lib/islands');

islands.list();
islands.load(name);
islands.get(name);
```

### lib/horcrux.js

Split brain across providers.

```javascript
const horcrux = require('./lib/horcrux');

horcrux.split(data, parts);
horcrux.join(parts);
horcrux.verify(shards);
```

### lib/citations.js

Citation management.

```javascript
const citations = require('./lib/citations');

citations.add(source);
citations.get(id);
citations.format(style);
```

### lib/gallery.js

Brain gallery view.

```javascript
const gallery = require('./lib/gallery');

gallery.render(files);
gallery.thumbnail(file);
gallery.preview(id);
```

## Utilities

### lib/hash.js

Hashing utilities.

```javascript
const hash = require('./lib/hash');

hash.sha256(data);
hash.verify(data, hash);
hash.hmac(data, secret);
```

### lib/uuid.js

UUID generation.

```javascript
const uuid = require('./lib/uuid');

uuid.v4();
uuid.v5(name, namespace);
uuid.validate(id);
```

### lib/timing.js

Timing utilities.

```javascript
const timing = require('./lib/timing');

timing.now();
timing.elapsed(start);
timing.format(ms);
```

### lib/memoize.js

Function memoization.

```javascript
const memoize = require('./lib/memoize');

memoize(fn, { ttl: 60000 });
memoize.clear();
```

### lib/compression.js

Compression utilities.

```javascript
const compression = require('./lib/compression');

compression.gzip(data);
compression.gunzip(data);
compression.deflate(data);
```

### lib/sanitize.js

Input sanitization.

```javascript
const sanitize = require('./lib/sanitize');

sanitize.html(input);
sanitize.url(input);
sanitize.sql(input);
```

### lib/validator.js

Validation utilities.

```javascript
const validator = require('./lib/validator');

validator.email(str);
validator.url(str);
validator.isUUID(str);
```

### lib/migration.js

Data migration.

```javascript
const migration = require('./lib/migration');

migration.up();
migration.down();
migration.current();
```

### lib/context.js

Request context.

```javascript
const context = require('./lib/context');

context.create(req, res);
context.get(key);
context.set(key, value);
```

### lib/static.js

Static file server.

```javascript
const static = require('./lib/static');

static.middleware(root);
static.serve(file);
```

### lib/config-flag.js

Feature flags.

```javascript
const config = require('./lib/config-flag');

config.enable(key);
config.disable(key);
config.isEnabled(key);
```

### lib/middleware-stack.js

Middleware stack.

```javascript
const stack = require('./lib/middleware-stack');

stack.use(middleware);
stack.handle(ctx);
```

### lib/health-check.js

Health check utilities.

```javascript
const health = require('./lib/health-check');

health.addCheck(name, fn);
health.check();
```

### lib/audit.js

Audit logging.

```javascript
const audit = require('./lib/audit');

audit.log(action, details);
audit.query(filters);
```

### lib/audit-log.js

Audit log persistence.

```javascript
const auditLog = require('./lib/audit-log');

auditLog.write(entry);
auditLog.read(id);
auditLog.list(filters);
```

### lib/cron-parser.js

Cron expression parser.

```javascript
const cron = require('./lib/cron-parser');

cron.parse(expr);
cron.next(date);
cron.validate(expr);
```

### lib/state.js

State management.

```javascript
const state = require('./lib/state');

state.set(key, value);
state.get(key);
state.subscribe(key, handler);
```

### lib/rerank.js

Search result reranking.

```javascript
const rerank = require('./lib/rerank');

rerank.rerank(query, results);
rerank.score(query, doc);
```

### lib/prune.js

Brain file pruning.

```javascript
const prune = require('./lib/prune');

prune.stale(files);
prune.obsolete(files);
prune.execute(options);
```

### lib/repos.js

Repository management.

```javascript
const repos = require('./lib/repos');

repos.list();
repos.add(name, url);
repos.sync(name);
```

### lib/linear.js

Linear issue tracking.

```javascript
const linear = require('./lib/linear');

linear.listIssues();
linear.createIssue(title, opts);
linear.addComment(id, body);
```

### lib/search-hybrid.js

Hybrid search (BM25 + Vector + RRF).

```javascript
const hybrid = require('./lib/search-hybrid');

hybrid.search(query);
hybrid.rerank(query, results);
```

### lib/search-hyde.js

HYDE (Hypothetical Document Embeddings).

```javascript
const hyde = require('./lib/search-hyde');

hyde.generate(query);
hyde.embed(query);
```

### lib/auth.js

Authentication.

```javascript
const auth = require('./lib/auth');

auth.login(credentials);
auth.logout();
auth.verify(token);
```

### lib/mitigate.js

Security mitigation utilities.

```javascript
const mitigate = require('./lib/mitigate');

mitigate.rateLimit();
mitigate.csrf();
mitigate.xss();
```
