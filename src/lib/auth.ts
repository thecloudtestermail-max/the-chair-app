// src/lib/auth.ts
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDatabase } from './mongodb';
import { Session, LoginAttempt } from './types';
import { ObjectId } from 'mongodb';

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(
  subjectId: ObjectId,
  subjectType: 'user' | 'customer',
  role: string,
  tenantId?: ObjectId,
  barberId?: ObjectId
): Promise<{ rawToken: string; expiresAt: Date }> {
  const db = await getDatabase();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const session: Session = {
    tokenHash,
    subjectId,
    subjectType,
    tenantId,
    barberId,
    role,
    expiresAt,
  };
  
  await db.collection('sessions').insertOne(session);
  return { rawToken, expiresAt };
}

export async function verifySessionToken(rawToken: string | undefined): Promise<Session | null> {
  if (!rawToken) return null;
  
  const db = await getDatabase();
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  
  const session = await db.collection<Session>('sessions').findOne({
    tokenHash,
    expiresAt: { $gt: new Date() },
  });
  
  return session || null;
}

export async function deleteSession(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  
  const db = await getDatabase();
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  
  await db.collection('sessions').deleteOne({ tokenHash });
}

export async function recordLoginAttempt(email: string): Promise<number> {
  const db = await getDatabase();
  const now = new Date();
  
  await db.collection<LoginAttempt>('loginAttempts').insertOne({
    email,
    createdAt: now,
  });
  
  const recentAttempts = await db.collection('loginAttempts').countDocuments({
    email,
    createdAt: { $gt: new Date(Date.now() - 15 * 60 * 1000) }, // Last 15 minutes
  });
  
  return recentAttempts;
}
