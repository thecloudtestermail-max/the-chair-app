// src/lib/auditLog.ts
//
// One call site per mutating platform-admin action (see AuditLogEntry in
// types.ts). Deliberately fire-and-forget from the caller's perspective —
// recordAuditLog awaits the insert itself (so ordering with the response is
// predictable in tests), but a logging failure must never fail the action
// it's describing, so every call site should treat this the same way it
// treats a best-effort email send: wrap it, don't let it throw past you.
import { getDatabase } from './mongodb';
import { AuditLogEntry, Session } from './types';
import { ObjectId } from 'mongodb';

export async function recordAuditLog(params: {
  actor: Session;
  action: string;
  targetType: AuditLogEntry['targetType'];
  targetId?: ObjectId | string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = await getDatabase();
    const targetId =
      typeof params.targetId === 'string' ? new ObjectId(params.targetId) : params.targetId;

    // The session carries subjectId but not email — look the actor's email
    // up once so the log line is still readable if the account is later
    // removed (targetType 'admin' + a since-deleted admin, for instance).
    const actorUser = await db
      .collection('users')
      .findOne({ _id: params.actor.subjectId }, { projection: { email: 1 } });

    const entry: AuditLogEntry = {
      actorId: params.actor.subjectId,
      actorEmail: actorUser?.email || 'unknown',
      action: params.action,
      targetType: params.targetType,
      targetId,
      meta: params.meta,
      createdAt: new Date(),
    };
    await db.collection<AuditLogEntry>('auditLogs').insertOne(entry);
  } catch (error) {
    console.error('[auditLog] failed to record entry:', error);
  }
}
