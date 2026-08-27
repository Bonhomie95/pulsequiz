/**
 * Log volume is a production concern, not a cosmetic one: warn forwards to
 * Sentry, so a line that fires per request burns quota and buries real faults.
 * These pin the properties that keep volume bounded.
 */
type LoggerModule = typeof import('../utils/logger');

let logger: LoggerModule['logger'];
let sinks: LoggerModule['sinks'];

const captured: { level: string; line: string }[] = [];
let spies: jest.SpyInstance[] = [];

beforeAll(() => {
  // setup.ts pins LOG_LEVEL=error so the suite stays quiet, and the logger
  // reads its minimum level once at module load. Load a fresh copy at debug so
  // every level is observable here. Safe to isolate: logger.ts pulls in no
  // models, so this cannot disturb Mongoose's registry.
  process.env.LOG_LEVEL = 'debug';
  jest.isolateModules(() => {
    const mod = require('../utils/logger') as LoggerModule;
    logger = mod.logger;
    sinks = mod.sinks;
  });
});

afterAll(() => {
  process.env.LOG_LEVEL = 'error';
});

beforeEach(() => {
  captured.length = 0;
  spies = [
    jest.spyOn(console, 'log').mockImplementation((l) => captured.push({ level: 'log', line: String(l) })),
    jest.spyOn(console, 'warn').mockImplementation((l) => captured.push({ level: 'warn', line: String(l) })),
    jest.spyOn(console, 'error').mockImplementation((l) => captured.push({ level: 'error', line: String(l) })),
  ];
});

afterEach(() => spies.forEach((s) => s.mockRestore()));

describe('logger.once', () => {
  it('emits once per key inside the window, however often it is called', () => {
    for (let i = 0; i < 50; i++) {
      logger.once('unit-test-repeat', 'warn', 'repeated condition');
    }
    expect(captured.filter((c) => c.line.includes('repeated condition'))).toHaveLength(1);
  });

  it('keeps distinct keys independent', () => {
    logger.once('unit-test-a', 'warn', 'condition A');
    logger.once('unit-test-b', 'warn', 'condition B');
    expect(captured.filter((c) => /condition [AB]/.test(c.line))).toHaveLength(2);
  });

  it('emits again once the window has elapsed', () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    logger.once('unit-test-window', 'warn', 'windowed condition', undefined, 1000);
    now.mockReturnValue(1_000_500); // inside the window
    logger.once('unit-test-window', 'warn', 'windowed condition', undefined, 1000);
    expect(captured.filter((c) => c.line.includes('windowed condition'))).toHaveLength(1);

    now.mockReturnValue(1_002_000); // past it
    logger.once('unit-test-window', 'warn', 'windowed condition', undefined, 1000);
    expect(captured.filter((c) => c.line.includes('windowed condition'))).toHaveLength(2);
    now.mockRestore();
  });

  it('does not grow its key map without bound', () => {
    // Keys can be built from request-controlled values (a rejection reason, a
    // package name), so an unbounded map would be a memory leak reachable from
    // the network. The observable consequence of the cap is that a key logged
    // long ago is eventually forgotten and will log again.
    logger.once('eviction-canary', 'debug', 'canary');
    captured.length = 0;

    // Push well past the cap so the canary is evicted.
    for (let i = 0; i < 600; i++) logger.once(`filler-${i}`, 'debug', 'filler');

    captured.length = 0;
    logger.once('eviction-canary', 'debug', 'canary');
    expect(captured.filter((c) => c.line.includes('canary'))).toHaveLength(1);
  });
});

describe('redaction', () => {
  it('masks secrets passed by name rather than leaking them', () => {
    logger.warn('purchase rejected', {
      purchaseToken: 'super-secret-token-value',
      sku: 'coins_100',
    });
    const line = captured.map((c) => c.line).join('\n');
    expect(line).not.toContain('super-secret-token-value');
    expect(line).toContain('[redacted]');
    expect(line).toContain('coins_100');
  });
});

describe('Sentry forwarding', () => {
  it('forwards warn and error, but not info or debug', () => {
    const original = { ...sinks };
    const messages: string[] = [];
    const errors: string[] = [];
    sinks.reportMessage = (m) => messages.push(m);
    sinks.reportError = (e) => errors.push(String(e));

    logger.debug('a debug line');
    logger.info('an info line');
    logger.warn('a warn line');
    logger.error('an error line');

    // Routine events re-levelled to info/debug must stay out of Sentry —
    // that is the whole point of moving them down.
    expect(messages).toEqual(['a warn line']);
    expect(errors).toHaveLength(1);

    Object.assign(sinks, original);
  });
});
