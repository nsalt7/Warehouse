// JSON-file persistence. The whole app state lives in data/db.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

export class Store {
  constructor(dir = process.env.RP_DATA_DIR || DEFAULT_DIR) {
    this.file = path.join(dir, 'db.json');
    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(this.file)) {
      this.state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } else {
      this.state = { mesocycles: [], nextId: 1 };
    }
  }

  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, this.file);
  }

  newId() {
    return String(this.state.nextId++);
  }

  getMeso(id) {
    return this.state.mesocycles.find((m) => m.id === id);
  }
}
