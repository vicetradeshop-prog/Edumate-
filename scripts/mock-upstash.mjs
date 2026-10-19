/**
 * EduMate — Faux serveur Upstash Redis (API REST), utilisé par les tests.
 *
 * Il reproduit fidèlement le contrat de l'API réelle, y compris ses erreurs :
 *   POST /           corps attendu : ["CMD", "arg1", …]        → { result }
 *   POST /pipeline   corps attendu : [["CMD", …], ["CMD", …]]  → [{ result }, …]
 *
 * Si un tableau de commandes est envoyé sur `/` (l'erreur qui a réellement
 * cassé le déploiement), il répond exactement comme Upstash :
 *   HTTP 400 {"error":"ERR unsupported arg type: \"[\": json.Delim"}
 *
 * Démarrage autonome :  node scripts/mock-upstash.mjs [port]
 */
import http from 'node:http';

export function createUpstashMock() {
  const store = new Map();
  const log = [];
  const requests = [];
  let hits = 0;

  /** Exécute une commande Redis et renvoie sa valeur de retour. */
  function exec(args, endpoint = 'root') {
    if (!Array.isArray(args) || args.length === 0) {
      throw Object.assign(new Error('ERR wrong number of arguments'), { status: 400 });
    }
    // Reproduction exacte de l'erreur Upstash quand un élément est un tableau.
    for (const arg of args) {
      if (Array.isArray(arg)) {
        throw Object.assign(new Error('ERR unsupported arg type: "[": json.Delim'), { status: 400 });
      }
      if (arg !== null && typeof arg === 'object') {
        throw Object.assign(new Error('ERR unsupported arg type: "{": json.Delim'), { status: 400 });
      }
    }

    const [rawCommand, ...rest] = args.map((value) => String(value));
    const command = rawCommand.toUpperCase();
    log.push([command, ...rest]);
    requests.push({ endpoint, command, args: rest });

    switch (command) {
      case 'PING':
        return 'PONG';
      case 'ECHO':
        return rest[0] ?? '';
      case 'SET': {
        if (rest.length < 2) throw Object.assign(new Error('ERR wrong number of arguments for SET'), { status: 400 });
        store.set(rest[0], rest[1]);
        return 'OK';
      }
      case 'GET':
        return store.has(rest[0]) ? store.get(rest[0]) : null;
      case 'DEL': {
        let removed = 0;
        for (const key of rest) if (store.delete(key)) removed += 1;
        return removed;
      }
      case 'EXISTS':
        return rest.filter((key) => store.has(key)).length;
      case 'KEYS': {
        const pattern = rest[0] ?? '*';
        const regex = new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`);
        return [...store.keys()].filter((key) => regex.test(key));
      }
      case 'MGET':
        return rest.map((key) => (store.has(key) ? store.get(key) : null));
      case 'FLUSHDB':
        store.clear();
        return 'OK';
      case 'DBSIZE':
        return store.size;
      case 'INCR': {
        const next = Number(store.get(rest[0]) ?? 0) + 1;
        store.set(rest[0], String(next));
        return next;
      }
      default:
        throw Object.assign(new Error(`ERR unknown command '${rawCommand}'`), { status: 400 });
    }
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  const server = http.createServer((req, res) => {
    hits += 1;
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 4_000_000) req.destroy();
    });
    req.on('end', () => {
      const send = (status, payload) => {
        const text = JSON.stringify(payload);
        res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
        res.end(text);
      };

      // L'API réelle exige un jeton Bearer.
      const auth = req.headers.authorization ?? '';
      if (!auth.startsWith('Bearer ')) {
        send(401, { error: 'Unauthorized: missing bearer token' });
        return;
      }

      let payload;
      try {
        payload = JSON.parse(body || '[]');
      } catch {
        send(400, { error: 'ERR invalid JSON body' });
        return;
      }

      const isPipeline = req.url?.replace(/\/$/, '') === '/pipeline';

      if (isPipeline) {
        if (!Array.isArray(payload) || payload.some((item) => !Array.isArray(item))) {
          send(400, { error: 'ERR pipeline body must be an array of command arrays' });
          return;
        }
        send(
          200,
          payload.map((args) => {
            try {
              return { result: exec(args, 'pipeline') };
            } catch (error) {
              return { error: error.message };
            }
          }),
        );
        return;
      }

      if (!Array.isArray(payload)) {
        send(400, { error: 'ERR body must be an array' });
        return;
      }
      try {
        send(200, { result: exec(payload, 'root') });
      } catch (error) {
        send(error.status ?? 400, { error: error.message });
      }
    });
  });

  return {
    server,
    store,
    log,
    /** Historique détaillé : quel endpoint a reçu quelle commande. */
    requests,
    /** Nombre de requêtes HTTP reçues (permet de vérifier le groupage). */
    get hits() {
      return hits;
    },
    /** Remet les compteurs à zéro sans effacer les données. */
    resetRequests() {
      log.length = 0;
      requests.length = 0;
      hits = 0;
    },
    reset() {
      store.clear();
      this.resetRequests();
    },
    listen(port = 0) {
      return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => {
          resolve(server.address().port);
        });
      });
    },
    close() {
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

// Démarrage autonome (débogage manuel)
const isDirectRun = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isDirectRun) {
  const mock = createUpstashMock();
  const port = Number(process.argv[2] ?? 8099);
  mock.listen(port).then((realPort) => {
    console.log(`[mock-upstash] prêt sur http://127.0.0.1:${realPort}`);
    console.log('[mock-upstash] token attendu : n’importe quelle valeur Bearer');
  });
}
