// src/lib/mongodb.ts
import { MongoClient, Db } from 'mongodb';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('Please define the MONGODB_URI environment variable');
}

interface CachedConnection {
  client: MongoClient;
  db: Db;
}

export async function connectToDatabase(): Promise<CachedConnection> {
  if (cachedClient && cachedDb) {
    try {
      await cachedDb.command({ ping: 1 });
      return { client: cachedClient, db: cachedDb };
    } catch {
      // Cached connection went stale (e.g. Atlas closed an idle socket) —
      // fall through and reconnect instead of reusing a dead topology.
      cachedClient = null;
      cachedDb = null;
    }
  }

  const client = new MongoClient(MONGODB_URI!);
  await client.connect();
  const db = client.db('chair-app');

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

export async function getDatabase(): Promise<Db> {
  const { db } = await connectToDatabase();
  return db;
}
