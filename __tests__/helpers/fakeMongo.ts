// __tests__/helpers/fakeMongo.ts
//
// A minimal, in-memory stand-in for the subset of the MongoDB driver v6 API
// this app actually uses (find/findOne/insertOne/updateOne/findOneAndUpdate/
// countDocuments/deleteOne/aggregate, with dot-path $exists/$gt/.../$in
// query support, dot-path $set, upsert, and an aggregate pipeline covering
// every stage/operator the real routes use: $match, $lookup, $unwind,
// $addFields, $project, $sort, $arrayElemAt, $dateToString). It is NOT a
// full Mongo emulator — it exists so the route-handler tests below exercise
// the real tenant-scoping/allow-list/join logic in each route against real
// documents, instead of just asserting "the mock was called with X".
//
// Matches driver v6 semantics we depend on: findOneAndUpdate with
// `returnDocument: 'after'` returns the updated document directly (or null),
// never a `{ value }`-wrapped ModifyResult.
import { ObjectId } from 'mongodb';

type Doc = Record<string, any>;

function getPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function valuesEqual(a: any, b: any): boolean {
  if (a instanceof ObjectId || b instanceof ObjectId) {
    return a?.toString?.() === b?.toString?.();
  }
  // Dates are compared by instant, as MongoDB does (two Date objects for the
  // same moment are never === in JS).
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

// Part 2 audit fix: the app's actual routes filter heavily on $in (status
// enums, _id lookups) and $gte/$lte (date-range queries — every
// appointments-by-day query in the codebase uses this shape). The
// original version of this helper only recognized $exists/$gt/$regex and,
// for any OTHER operator key it didn't recognize (including $in, $gte,
// $lte, $nin, $lt), fell through to an unconditional `return true` —
// silently matching every document regardless of that clause. That made
// every $in/$gte/$lte-filtered query in the fake permissive-by-default,
// which happened not to change any single test's outcome in the existing
// suite (small, hand-picked fixtures), but is a real gap: a genuine
// regression in the app's date-range or status-enum filtering would not
// necessarily be caught. Rewritten so an unrecognized operator key is a
// hard error instead of a silent pass — a test that exercises an operator
// this fake doesn't model should fail loudly, not "pass" for the wrong
// reason.
const KNOWN_OPERATORS = ['$exists', '$gt', '$gte', '$lt', '$lte', '$regex', '$options', '$in', '$nin'] as const;

function toComparable(v: any): any {
  return v instanceof Date ? v.getTime() : v instanceof ObjectId ? v.toString() : v;
}

function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$or') {
      return (condition as Doc[]).some((sub) => matches(doc, sub));
    }
    const actual = getPath(doc, key);
    if (condition && typeof condition === 'object' && !(condition instanceof ObjectId) && !(condition instanceof Date)) {
      const usedKeys = Object.keys(condition).filter((k) => k.startsWith('$'));
      const unknown = usedKeys.filter((k) => !(KNOWN_OPERATORS as readonly string[]).includes(k));
      if (unknown.length > 0) {
        throw new Error(`fakeMongo: unsupported query operator(s) ${unknown.join(', ')} on field "${key}" — extend fakeMongo.ts before relying on this filter in a test.`);
      }
      if ('$exists' in condition) {
        const exists = actual !== undefined;
        if (exists !== condition.$exists) return false;
      }
      if ('$gt' in condition && !(toComparable(actual) > toComparable(condition.$gt))) return false;
      if ('$gte' in condition && !(toComparable(actual) >= toComparable(condition.$gte))) return false;
      if ('$lt' in condition && !(toComparable(actual) < toComparable(condition.$lt))) return false;
      if ('$lte' in condition && !(toComparable(actual) <= toComparable(condition.$lte))) return false;
      if ('$regex' in condition) {
        if (!new RegExp(condition.$regex, condition.$options).test(actual ?? '')) return false;
      }
      if ('$in' in condition) {
        const wanted = (condition.$in as any[]).map(toComparable);
        if (!wanted.includes(toComparable(actual))) return false;
      }
      if ('$nin' in condition) {
        const excluded = (condition.$nin as any[]).map(toComparable);
        if (excluded.includes(toComparable(actual))) return false;
      }
      return true;
    }
    return valuesEqual(actual, condition);
  });
}

function applyProjection(doc: Doc, projection?: Record<string, 0 | 1>): Doc {
  if (!projection) return doc;
  const keys = Object.keys(projection);
  // Like MongoDB: a projection listing any field with 1 is an INCLUSION, and
  // _id is included automatically unless it is explicitly set to 0. (The
  // original fake dropped _id, which made routes that read s._id off a
  // projected document throw under test while working fine in production.)
  // ({ _id: 1 } on its own is an inclusion too.)
  const isInclusion = keys.some((k) => projection[k] === 1);
  if (isInclusion) {
    const out: Doc = {};
    if (projection._id !== 0 && '_id' in doc) out._id = doc._id;
    for (const k of keys) if (k !== '_id' && projection[k] === 1 && k in doc) out[k] = doc[k];
    return out;
  }
  const out = { ...doc };
  for (const k of keys) delete out[k];
  return out;
}

// Sets a (possibly dot-path) key to a value, cloning only the objects along
// the path — siblings and the rest of the document are untouched. Used by
// $set so `{ 'branding.primaryColor': '#fff' }` nests correctly instead of
// literally setting a key named "branding.primaryColor".
function setPath(obj: Doc, path: string, value: any): Doc {
  const parts = path.split('.');
  if (parts.length === 1) return { ...obj, [path]: value };
  const [head, ...rest] = parts;
  const child = obj[head] && typeof obj[head] === 'object' ? obj[head] : {};
  return { ...obj, [head]: setPath(child, rest.join('.'), value) };
}

function applyUpdate(doc: Doc, update: Doc): Doc {
  let next = { ...doc };
  if (update.$set) {
    for (const [key, val] of Object.entries(update.$set)) {
      next = setPath(next, key, val);
    }
  }
  if (update.$setOnInsert) {
    // Only meaningful on an actual insert (see upsert handling below) — a
    // plain updateOne/findOneAndUpdate on an EXISTING doc must ignore it,
    // matching real Mongo semantics.
  }
  if (update.$push) {
    for (const [key, val] of Object.entries(update.$push)) {
      next[key] = [...(next[key] || []), val];
    }
  }
  if (update.$inc) {
    // Dot-path aware, and creates a missing counter at 0 first, like Mongo.
    for (const [key, by] of Object.entries(update.$inc)) {
      const current = getPath(next, key);
      next = setPath(next, key, (typeof current === 'number' ? current : 0) + (by as number));
    }
  }
  return next;
}

// --- Aggregation pipeline -------------------------------------------------
//
// Supports exactly the stages/operators the app's routes use:
// $match, $lookup (equality join), $unwind, $addFields, $project
// (0/1 exclusion/inclusion OR a '$field.path' rename/compute expression),
// $sort, and inside $addFields/$project expressions: $arrayElemAt and
// $dateToString (format tokens %Y/%m/%d only — that's all the app uses).
// An unsupported stage or expression throws loudly, same philosophy as
// `matches()` above: a silent no-op would hide a real regression.

const KNOWN_STAGES = ['$match', '$lookup', '$unwind', '$addFields', '$project', '$sort', '$group'] as const;

// Mongo's dot-notation into an array of subdocuments projects the
// remaining path across every element (returning an array), rather than
// erroring the way plain JS property access on an array would. `$lookup`
// output is exactly this shape (an array of 0-or-1 matched docs) until an
// `$unwind` collapses it — so field-path resolution needs to branch on
// "is the current value an array of objects" at every step.
function resolveFieldPath(doc: any, path: string): any {
  const parts = path.split('.');
  let current: any = doc;
  for (let i = 0; i < parts.length; i++) {
    if (current == null) return current;
    if (Array.isArray(current)) {
      const rest = parts.slice(i).join('.');
      return current.map((el) => resolveFieldPath(el, rest));
    }
    current = current[parts[i]];
  }
  return current;
}

function formatDateToken(date: Date, format: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return format
    .replace('%Y', String(date.getFullYear()))
    .replace('%m', pad(date.getMonth() + 1))
    .replace('%d', pad(date.getDate()));
}

function resolveExpr(doc: Doc, expr: any): any {
  if (typeof expr === 'string' && expr.startsWith('$')) {
    return resolveFieldPath(doc, expr.slice(1));
  }
  if (expr && typeof expr === 'object' && !(expr instanceof ObjectId) && !(expr instanceof Date) && !Array.isArray(expr)) {
    if ('$arrayElemAt' in expr) {
      const [arrExpr, idx] = expr.$arrayElemAt;
      const arr = resolveExpr(doc, arrExpr);
      if (!Array.isArray(arr)) return undefined;
      const i = idx < 0 ? arr.length + idx : idx;
      return arr[i];
    }
    if ('$dateToString' in expr) {
      const { format, date } = expr.$dateToString;
      const resolved = resolveExpr(doc, date);
      if (!(resolved instanceof Date)) return null;
      return formatDateToken(resolved, format);
    }
    const unknown = Object.keys(expr).filter((k) => k.startsWith('$'));
    if (unknown.length > 0) {
      throw new Error(`fakeMongo: unsupported aggregation expression operator(s) ${unknown.join(', ')} — extend fakeMongo.ts before relying on this in a test.`);
    }
  }
  return expr; // literal value
}

function applyAddFields(doc: Doc, fields: Doc): Doc {
  const next = { ...doc };
  for (const [key, expr] of Object.entries(fields)) {
    next[key] = resolveExpr(doc, expr);
  }
  return next;
}

function applyAggProject(doc: Doc, projection: Doc): Doc {
  const keys = Object.keys(projection);
  const hasComputedOrInclude = keys.some((k) => projection[k] === 1 || (typeof projection[k] === 'string' && projection[k].startsWith('$')));
  if (!hasComputedOrInclude) {
    // Pure exclusion projection, e.g. { customer: 0, barber: 0 }.
    const out = { ...doc };
    for (const k of keys) delete out[k];
    return out;
  }
  const out: Doc = {};
  if (!('_id' in projection) || projection._id !== 0) {
    if ('_id' in doc) out._id = doc._id;
  }
  for (const k of keys) {
    if (k === '_id') continue;
    const v = projection[k];
    if (v === 1) {
      if (k in doc) out[k] = doc[k];
    } else if (v === 0) {
      continue;
    } else {
      out[k] = resolveExpr(doc, v);
    }
  }
  return out;
}

function sortDocs(docs: Doc[], sortSpec: Record<string, 1 | -1>): Doc[] {
  const entries = Object.entries(sortSpec);
  return [...docs].sort((a, b) => {
    for (const [key, dir] of entries) {
      const av = toComparable(getPath(a, key));
      const bv = toComparable(getPath(b, key));
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
    }
    return 0;
  });
}

// $group with the accumulators the app (and tests) need: $sum (a number or a
// '$field'), $avg, $first, $min, $max. The group key is a '$field' path or
// null (one group for everything); keys are compared by their string form so
// ObjectIds group correctly.
function applyGroup(rows: Doc[], spec: Doc): Doc[] {
  const { _id: keyExpr, ...accs } = spec;
  const keyOf = (d: Doc) => (typeof keyExpr === 'string' && keyExpr.startsWith('$') ? getPath(d, keyExpr.slice(1)) : keyExpr ?? null);
  const groups = new Map<string, { key: any; docs: Doc[] }>();
  for (const d of rows) {
    const key = keyOf(d);
    const id = key == null ? 'null' : String(key);
    if (!groups.has(id)) groups.set(id, { key, docs: [] });
    groups.get(id)!.docs.push(d);
  }
  const val = (d: Doc, e: any) => (typeof e === 'string' && e.startsWith('$') ? getPath(d, e.slice(1)) : e);
  return [...groups.values()].map(({ key, docs }) => {
    const out: Doc = { _id: key };
    for (const [name, acc] of Object.entries(accs) as Array<[string, Doc]>) {
      const [op, arg] = Object.entries(acc)[0];
      const vals = docs.map((d) => val(d, arg));
      const nums = vals.filter((v) => typeof v === 'number') as number[];
      if (op === '$sum') out[name] = nums.reduce((a, b) => a + b, 0);
      else if (op === '$avg') out[name] = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      else if (op === '$first') out[name] = vals[0];
      else if (op === '$min') out[name] = nums.length ? Math.min(...nums) : null;
      else if (op === '$max') out[name] = nums.length ? Math.max(...nums) : null;
      else throw new Error(`fakeMongo: unsupported $group accumulator ${op} — extend fakeMongo.ts before relying on it in a test.`);
    }
    return out;
  });
}

// A minimal stand-in for the driver's FindCursor: only .sort()/.limit()/.project()
// chaining (both mutate-and-return-this, matching the real cursor) plus
// .toArray(), which is all the app's find() call sites use.
class FakeCursor {
  private rows: Doc[];
  private sortSpec: Record<string, 1 | -1> | null = null;
  private limitN: number | null = null;

  constructor(rows: Doc[]) {
    this.rows = rows;
  }

  sort(spec: Record<string, 1 | -1>) {
    this.sortSpec = spec;
    return this;
  }

  limit(n: number) {
    this.limitN = n;
    return this;
  }

  // The driver's cursor.project(): several routes chain it after find()
  // (e.g. customers, to drop passwordHash) and the fake never had it, so those
  // routes threw "project is not a function" (a 500) under test.
  project(spec: Record<string, 0 | 1>) {
    this.rows = this.rows.map((d) => applyProjection(d, spec));
    return this;
  }

  async toArray() {
    let out = this.sortSpec ? sortDocs(this.rows, this.sortSpec) : this.rows;
    if (this.limitN != null) out = out.slice(0, this.limitN);
    return out;
  }
}

export class FakeCollection {
  docs: Doc[] = [];
  private db: FakeDb | null = null;

  /** Wired up by FakeDb.collection() so $lookup can reach sibling collections. */
  _attachDb(db: FakeDb) {
    this.db = db;
  }

  seed(docs: Doc[]) {
    this.docs = docs.map((d) => ({ ...d }));
    return this;
  }

  find(filter: Doc = {}, opts: { projection?: Record<string, 0 | 1> } = {}) {
    const results = this.docs.filter((d) => matches(d, filter)).map((d) => applyProjection(d, opts.projection));
    return new FakeCursor(results);
  }

  async findOne(filter: Doc = {}, opts: { projection?: Record<string, 0 | 1> } = {}) {
    const found = this.docs.find((d) => matches(d, filter));
    return found ? applyProjection(found, opts.projection) : null;
  }

  async insertOne(doc: Doc) {
    const _id = doc._id ?? new ObjectId();
    const withId = { ...doc, _id };
    this.docs.push(withId);
    return { insertedId: _id };
  }

  async updateOne(filter: Doc, update: Doc, opts: { upsert?: boolean } = {}) {
    const idx = this.docs.findIndex((d) => matches(d, filter));
    if (idx === -1) {
      if (opts.upsert) {
        // Real Mongo seeds the new doc from the filter's equality clauses
        // plus $set/$setOnInsert. Every call site in this app only ever
        // filters on plain equality (no operators) when upserting, so
        // that's the only case handled here.
        const seed: Doc = {};
        for (const [k, v] of Object.entries(filter)) {
          if (v == null || typeof v !== 'object' || v instanceof ObjectId || v instanceof Date) seed[k] = v;
        }
        let inserted: Doc = { ...seed, _id: new ObjectId() };
        if (update.$setOnInsert) inserted = { ...inserted, ...update.$setOnInsert };
        if (update.$set) inserted = { ...inserted, ...update.$set };
        this.docs.push(inserted);
        return { matchedCount: 0, modifiedCount: 0, upsertedId: inserted._id };
      }
      return { matchedCount: 0, modifiedCount: 0 };
    }
    this.docs[idx] = applyUpdate(this.docs[idx], update);
    return { matchedCount: 1, modifiedCount: 1 };
  }

  async findOneAndUpdate(
    filter: Doc,
    update: Doc,
    opts: { returnDocument?: 'after' | 'before'; projection?: Record<string, 0 | 1>; upsert?: boolean } = {}
  ) {
    const idx = this.docs.findIndex((d) => matches(d, filter));
    if (idx === -1) {
      if (opts.upsert) {
        const seed: Doc = {};
        for (const [k, v] of Object.entries(filter)) {
          if (v == null || typeof v !== 'object' || v instanceof ObjectId || v instanceof Date) seed[k] = v;
        }
        let inserted: Doc = { ...seed, _id: new ObjectId() };
        if (update.$setOnInsert) inserted = { ...inserted, ...update.$setOnInsert };
        if (update.$set) inserted = { ...inserted, ...update.$set };
        this.docs.push(inserted);
        return applyProjection(inserted, opts.projection);
      }
      return null; // v6: no `.value` wrapper — null directly on no match
    }
    const before = this.docs[idx];
    const after = applyUpdate(before, update);
    this.docs[idx] = after;
    const result = opts.returnDocument === 'before' ? before : after;
    return applyProjection(result, opts.projection);
  }

  async countDocuments(filter: Doc = {}) {
    return this.docs.filter((d) => matches(d, filter)).length;
  }

  // Added by the Part 2 audit: several real routes (categories, services,
  // barbers, favorites DELETE handlers) call deleteOne(), which this
  // helper never implemented — any test exercising those routes would
  // have thrown "deleteOne is not a function" rather than failing on an
  // actual assertion.
  async deleteOne(filter: Doc) {
    const idx = this.docs.findIndex((d) => matches(d, filter));
    if (idx === -1) return { deletedCount: 0 };
    this.docs.splice(idx, 1);
    return { deletedCount: 1 };
  }

  async deleteMany(filter: Doc = {}) {
    const before = this.docs.length;
    this.docs = this.docs.filter((d) => !matches(d, filter));
    return { deletedCount: before - this.docs.length };
  }

  async updateMany(filter: Doc, update: Doc) {
    let modified = 0;
    this.docs = this.docs.map((d) => {
      if (!matches(d, filter)) return d;
      modified += 1;
      return applyUpdate(d, update);
    });
    return { matchedCount: modified, modifiedCount: modified };
  }

  aggregate(pipeline: Doc[]) {
    let rows: Doc[] = this.docs.map((d) => ({ ...d }));

    for (const stage of pipeline) {
      const stageNames = Object.keys(stage);
      const unknown = stageNames.filter((s) => !(KNOWN_STAGES as readonly string[]).includes(s));
      if (unknown.length > 0) {
        throw new Error(`fakeMongo: unsupported aggregation stage(s) ${unknown.join(', ')} — extend fakeMongo.ts before relying on this pipeline in a test.`);
      }

      if (stage.$match) {
        rows = rows.filter((d) => matches(d, stage.$match));
      } else if (stage.$lookup) {
        const { from, localField, foreignField, as } = stage.$lookup;
        if (!this.db) throw new Error('fakeMongo: $lookup used on a collection not attached to a FakeDb — use db.collection(name), not `new FakeCollection()` directly.');
        const foreign = this.db.collection(from).docs;
        rows = rows.map((d) => {
          const localVal = getPath(d, localField);
          const matched = foreign.filter((f) => valuesEqual(getPath(f, foreignField), localVal));
          return { ...d, [as]: matched.map((m) => ({ ...m })) };
        });
      } else if (stage.$unwind) {
        const field = (stage.$unwind as string).replace(/^\$/, '');
        const next: Doc[] = [];
        for (const d of rows) {
          const arr = d[field];
          if (Array.isArray(arr)) {
            for (const el of arr) next.push({ ...d, [field]: el });
            // Default $unwind (no preserveNullAndEmptyArrays) drops the
            // doc entirely when the array is empty — matches every real
            // usage in this app (favorites → tenants is always 1:1).
          } else if (arr != null) {
            next.push(d); // already a scalar — nothing to unwind
          }
        }
        rows = next;
      } else if (stage.$addFields) {
        rows = rows.map((d) => applyAddFields(d, stage.$addFields));
      } else if (stage.$project) {
        rows = rows.map((d) => applyAggProject(d, stage.$project));
      } else if (stage.$sort) {
        rows = sortDocs(rows, stage.$sort);
      } else if (stage.$group) {
        rows = applyGroup(rows, stage.$group);
      }
    }

    return { toArray: async () => rows };
  }
}

export class FakeDb {
  collections = new Map<string, FakeCollection>();

  collection(name: string): FakeCollection {
    if (!this.collections.has(name)) {
      const c = new FakeCollection();
      c._attachDb(this);
      this.collections.set(name, c);
    }
    return this.collections.get(name)!;
  }
}
