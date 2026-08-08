import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { timingSafeEqual } from 'crypto';
import ssh2 from 'ssh2';
import type {
  AuthContext,
  Connection,
  ParsedKey,
  ServerChannel,
  Session,
} from 'ssh2';
import { evaluate, parseTape } from './evaluator.js';
import { TokenType } from './token.js';
import { withResolvers } from './promise.js';

const { Server, utils } = ssh2;

const shutdownTimeout = 30_000;

interface ActiveRender {
  controller: AbortController;
  task: Promise<void>;
}

export function forceCloseSSHResources(
  clients: Iterable<{ end(): unknown; destroy?(): unknown; _sock?: { destroy(): unknown } }>,
  renders: Iterable<{ controller: AbortController }>,
): void {
  for (const render of renders) render.controller.abort(new Error('SSH shutdown timed out'));
  for (const client of clients) {
    if (client.destroy) client.destroy();
    else if (client._sock) client._sock.destroy();
    else client.end();
  }
}

export interface ServerConfig {
  port: number;
  allowUnauthenticated?: boolean;
  host: string;
  gid: number;
  uid: number;
  keyPath: string;
  authorizedKeysPath: string;
  output?: (message: string) => void;
}

export function serverConfigFromEnv(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parseInteger = (name: string, fallback: number): number => {
    const value = environment[`VHS_${name}`];
    if (value === undefined || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) throw new Error(`VHS_${name} must be an integer`);
    return parsed;
  };

  return {
    allowUnauthenticated: environment.VHS_ALLOW_UNAUTHENTICATED === '1',
    port: parseInteger('PORT', 1976),
    host: environment.VHS_HOST || 'localhost',
    gid: parseInteger('GID', 0),
    uid: parseInteger('UID', 0),
    keyPath: environment.VHS_KEY_PATH || path.join('.ssh', 'vhs_ed25519'),
    authorizedKeysPath: environment.VHS_AUTHORIZED_KEYS_PATH || '',
  };
}

function loadHostKey(keyPath: string): Buffer {
  if (!fs.existsSync(keyPath)) {
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    const keyPair = utils.generateKeyPairSync('ed25519');
    fs.writeFileSync(keyPath, keyPair.private, { mode: 0o600 });
  }
  return fs.readFileSync(keyPath);
}

function loadAuthorizedKeys(authorizedKeysPath: string): ParsedKey[] {
  if (authorizedKeysPath === '') return [];
  const keys: ParsedKey[] = [];
  for (const line of fs.readFileSync(authorizedKeysPath, 'utf8').split(/\r?\n/)) {
    const source = line.trim();
    if (source === '' || source.startsWith('#')) continue;
    const keyStart = source.search(/(?:^|\s)(?:ssh-(?:rsa|dss|ed25519)|ecdsa-sha2-nistp(?:256|384|521))\s+/);
    if (keyStart < 0) throw new Error('Invalid authorized key: unsupported key format');
    const parsed = utils.parseKey(source.slice(keyStart).trimStart());
    if (parsed instanceof Error) throw new Error(`Invalid authorized key: ${parsed.message}`);
    keys.push(parsed);
  }
  if (keys.length === 0) {
    throw new Error(`No authorized keys found in ${authorizedKeysPath}`);
  }
  return keys;
}

function sameKey(actual: Buffer, allowed: Buffer): boolean {
  return actual.length === allowed.length && timingSafeEqual(actual, allowed);
}

function authenticate(
  context: AuthContext,
  authorizedKeys: ParsedKey[],
  allowUnauthenticated: boolean,
): void {
  if (authorizedKeys.length === 0) {
    if (allowUnauthenticated && context.method === 'none') context.accept();
    else context.reject(allowUnauthenticated ? ['none'] : ['publickey']);
    return;
  }

  if (context.method !== 'publickey') {
    context.reject(['publickey']);
    return;
  }

  const allowed = authorizedKeys.find(
    (key) => key.type === context.key.algo && sameKey(key.getPublicSSH(), context.key.data),
  );
  if (!allowed) {
    context.reject(['publickey']);
    return;
  }
  if (
    context.signature &&
    (!context.blob || allowed.verify(context.blob, context.signature, context.hashAlgo) !== true)
  ) {
    context.reject(['publickey']);
    return;
  }
  context.accept();
}

export function serverOutputExtension(tape: string): '.gif' | '.mp4' | '.webm' {
  const { commands, errors } = parseTape(tape);
  if (errors.length > 0) return '.gif';
  const outputTypes = new Set<string>();
  for (const command of commands) {
    if (command.type === TokenType.SCREENSHOT) {
      throw new Error('Screenshot is not allowed in SSH server tapes');
    }
    if (command.type !== TokenType.OUTPUT) continue;
    if (!['.gif', '.mp4', '.webm'].includes(command.options)) {
      throw new Error(`Output ${command.options || command.args} is not allowed in SSH server tapes`);
    }
    outputTypes.add(command.options);
  }
  if (outputTypes.has('.mp4')) return '.mp4';
  if (outputTypes.has('.webm')) return '.webm';
  return '.gif';
}

async function renderTape(stream: ServerChannel, tape: string, signal: AbortSignal): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vhs-serve-'));
  try {
    const outputPath = path.join(tempDir, `output${serverOutputExtension(tape)}`);
    const { errors } = await evaluate(tape, {
      output: (message) => stream.stderr.write(`${message}\n`),
      outputPaths: [outputPath],
      signal,
    });
    if (errors.length > 0) {
      for (const error of errors) stream.stderr.write(`${error.message}\n`);
      stream.exit(1);
      stream.end();
      return;
    }
    stream.write(fs.readFileSync(outputPath));
    stream.exit(0);
    stream.end();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function handleChannel(
  stream: ServerChannel,
  activeRenders: Set<ActiveRender>,
  isShuttingDown: () => boolean,
): void {
  const chunks: Buffer[] = [];
  let activeRender: ActiveRender | undefined;
  stream.on('data', (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  stream.once('close', () => activeRender?.controller.abort(new Error('SSH client disconnected')));
  stream.once('end', () => {
    if (isShuttingDown()) {
      stream.exit(1);
      stream.end();
      return;
    }
    const controller = new AbortController();
    const task = renderTape(stream, Buffer.concat(chunks).toString('utf8'), controller.signal).catch(
      (error: unknown) => {
        stream.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        stream.exit(1);
        stream.end();
      },
    );
    const request = { controller, task };
    activeRender = request;
    activeRenders.add(request);
    const removeRequest = () => activeRenders.delete(request);
    void task.then(removeRequest, removeRequest);
  });
}

function handleSession(
  session: Session,
  activeRenders: Set<ActiveRender>,
  isShuttingDown: () => boolean,
): void {
  let pty = false;
  session.on('pty', (accept) => {
    pty = true;
    accept();
  });
  const acceptChannel = (accept: () => ServerChannel): void => {
    const stream = accept();
    if (pty) {
      stream.write('PTY is not supported\n');
      stream.exit(1);
      stream.end();
      return;
    }
    handleChannel(stream, activeRenders, isShuttingDown);
  };
  session.on('shell', (accept) => acceptChannel(accept));
  session.on('exec', (accept) => acceptChannel(accept));
}

export interface PrivilegeOperations {
  setgid?: (gid: number) => void;
  setuid?: (uid: number) => void;
}

export function dropPrivileges(
  config: ServerConfig,
  operations: PrivilegeOperations = {
    setgid: typeof process.setgid === 'function' ? (gid) => process.setgid!(gid) : undefined,
    setuid: typeof process.setuid === 'function' ? (uid) => process.setuid!(uid) : undefined,
  },
): void {
  if (config.gid !== 0 && !operations.setgid) {
    throw new Error('VHS_GID is not supported on this platform');
  }
  if (config.uid !== 0 && !operations.setuid) {
    throw new Error('VHS_UID is not supported on this platform');
  }
  if (config.gid !== 0) operations.setgid!(config.gid);
  if (config.uid !== 0) operations.setuid!(config.uid);
}

export function serveSSH(
  config: ServerConfig = serverConfigFromEnv(),
  signal?: AbortSignal,
): Promise<void> {
  if (config.authorizedKeysPath === '' && config.allowUnauthenticated !== true) {
    throw new Error(
      'SSH server authentication is required; set VHS_AUTHORIZED_KEYS_PATH or explicitly opt in with VHS_ALLOW_UNAUTHENTICATED=1',
    );
  }
  const authorizedKeys = loadAuthorizedKeys(config.authorizedKeysPath);
  const clients = new Set<Connection>();
  const activeRenders = new Set<ActiveRender>();
  const { promise, resolve, reject } = withResolvers<void>();
  const closed = withResolvers<void>();
  let shuttingDown = false;
  const server = new Server({ hostKeys: [loadHostKey(config.keyPath)] }, (client) => {
    clients.add(client);
    client.once('close', () => clients.delete(client));
    client.on('authentication', (context) =>
      authenticate(context, authorizedKeys, config.allowUnauthenticated === true),
    );
    client.on('ready', () => {
      client.on('session', (accept) =>
        handleSession(accept(), activeRenders, () => shuttingDown),
      );
    });
  });

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const render of activeRenders) render.controller.abort(new Error('SSH server shutting down'));
    for (const client of clients) client.end();
    server.close();
    const deadline = withResolvers<never>();
    const timeout = setTimeout(() => {
      forceCloseSSHResources(clients, activeRenders);
      deadline.reject(new Error(`SSH server shutdown exceeded ${shutdownTimeout}ms`));
    }, shutdownTimeout);
    const cleanup = Promise.allSettled([...activeRenders].map((render) => render.task))
      .then(() => closed.promise);
    void Promise.race([cleanup, deadline.promise]).then(
      () => {
        clearTimeout(timeout);
        resolve();
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  };
  signal?.addEventListener('abort', shutdown, { once: true });
  server.once('error', reject);
  server.once('close', () => {
    signal?.removeEventListener('abort', shutdown);
    closed.resolve();
    if (!shuttingDown) resolve();
  });
  server.listen(config.port, config.host, () => {
    try {
      dropPrivileges(config);
      (config.output ?? console.log)(`Starting SSH server on ${config.host}:${config.port}`);
      if (signal?.aborted) shutdown();
    } catch (error) {
      server.close();
      reject(error);
    }
  });
  return promise;
}
