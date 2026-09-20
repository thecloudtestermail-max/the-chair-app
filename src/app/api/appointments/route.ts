// src/app/api/appointments/route.ts
//
// Staff-facing appointment list/create/update. Tenant scoping comes from the
// authenticated session — see src/lib/requireRole.ts. Public/unauthenticated
// booking (a customer booking themselves) is handled by
// /api/t/[tenantSlug]/book instead, which resolves the tenant from the URL.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { requireRole } from '@/lib/requireRole';
import { Appointment, AppointmentLog } from '@/lib/types';
import { pointsForPrice } from '@/lib/loyalty';
import { sendBookingEmail } from '@/lib/notifications';
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

const ALLOWED_UPDATE_FIELDS = ['notes'];

export async function GET(req: NextRequest) {
  const session = await requireRole(req, ['admin', 'receptionist', 'barber']);
  if (!session?.tenantId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  // A barber-role session only ever sees their own schedule, never the
  // whole salon's — the session already carries `barberId` (set at login,
  // see api/auth/login), so this is a straight match,
  // not something the caller can override. A barber account created
  // without a linked profile (see dashboard/staff's optional "Linked
  // barber profile" field) has nothing to scope to, so it sees nothing
  // rather than falling open to every appointment in the tenant.
  if (session.role === 'barber' && !session.barberId) {
    return NextResponse.json([]);
  }

  try {
    const db = await getDatabase();
    const matchStage: Record<string, any> = { tenantId: session.tenantId };
    if (session.role === 'barber') {
      matchStage.barberId = session.barberId;
    }
    // Populated via aggregation (audit fix): the appointments list used to
    // return bare ObjectId references for barberId/serviceId/customerId,
    // which the (broken) customer-facing appointments page assumed were
    // already populated objects. This dashboard list needs the same names
    // to render anything useful, so fixing it here benefits both surfaces.
    const appointments = await db
      .collection<Appointment>('appointments')
      .aggregate([
        { $match: matchStage },
        { $lookup: { from: 'barbers', localField: 'barberId', foreignField: '_id', as: 'barber' } },
        { $lookup: { from: 'services', localField: 'serviceId', foreignField: '_id', as: 'service' } },
        { $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customer' } },
        {
          $addFields: {
            barberName: { $arrayElemAt: ['$barber.name', 0] },
            serviceName: { $arrayElemAt: ['$service.name', 0] },
            servicePrice: { $arrayElemAt: ['$service.price', 0] },
            serviceDuration: { $arrayElemAt: ['$service.duration', 0] },
            customerName: { $arrayElemAt: ['$customer.name', 0] },
            customerPhone: { $arrayElemAt: ['$customer.phone', 0] },
          },
        },
        { $project: { barber: 0, service: 0, customer: 0 } },
        { $sort: { dateTime: 1 } },
      ])
      .toArray();

    return NextResponse.json(appointments);
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to fetch appointments', error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireRole(req, ['admin', 'receptionist']);
  if (!session?.tenantId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { customerId, barberId, serviceId, dateTime, notes, status: requestedStatus, source } = body;
    const initialStatus = requestedStatus === 'waitlist' ? 'waitlist' : 'pending';

    if (!customerId || !barberId || !serviceId || (!dateTime && initialStatus !== 'waitlist')) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    const db = await getDatabase();

    // Ownership check (audit fix): a staff member can only book their own
    // tenant's barber/service, and only a customer with a loyalty
    // relationship to this tenant — mirrors the scoping every other
    // mutating route already enforces, and the check the public booking
    // endpoint already does for the same two fields.
    const [barber, service, customer] = await Promise.all([
      db.collection('barbers').findOne({ _id: new ObjectId(barberId), tenantId: session.tenantId }),
      db.collection('services').findOne({ _id: new ObjectId(serviceId), tenantId: session.tenantId }),
      db.collection('customers').findOne({
        _id: new ObjectId(customerId),
        [`loyaltyPoints.${session.tenantId.toString()}`]: { $exists: true },
      }),
    ]);
    if (!barber) return NextResponse.json({ message: 'Barber not found for this tenant' }, { status: 400 });
    if (!service) return NextResponse.json({ message: 'Service not found for this tenant' }, { status: 400 });
    if (!customer) return NextResponse.json({ message: 'Customer not found for this tenant' }, { status: 400 });

    const log: AppointmentLog = {
      timestamp: new Date(),
      action: 'created',
      changedBy: `${session.role}:${session.subjectId.toString()}`,
    };

    const appointment: Appointment = {
      tenantId: session.tenantId,
      customerId: new ObjectId(customerId),
      barberId: new ObjectId(barberId),
      serviceId: new ObjectId(serviceId),
      dateTime: dateTime ? new Date(dateTime) : new Date(),
      status: initialStatus,
      source: source === 'walk-in' ? 'walk-in' : 'online',
      notes,
      log: [log],
    };

    const result = await db.collection<Appointment>('appointments').insertOne(appointment);
    return NextResponse.json({ _id: result.insertedId, ...appointment }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to create appointment', error: error.message }, { status: 500 });
  }
}

// Barbers may work their own bookings (confirm, complete, cancel) but not
// reopen them or move them to the waitlist. The dashboard already showed
// barbers a status control; this route used to refuse it.
const BARBER_STATUSES = ['confirmed', 'completed', 'cancelled'];

export async function PUT(req: NextRequest) {
  const session = await requireRole(req, ['admin', 'receptionist', 'barber']);
  if (!session?.tenantId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const isBarber = session.role === 'barber';
  // Same rule as GET: a barber with no linked profile has no schedule to act on.
  if (isBarber && !session.barberId) return NextResponse.json({ message: 'Appointment not found' }, { status: 404 });

  try {
    const body = await req.json();
    const { _id, status, ...rest } = body;

    if (!_id) return NextResponse.json({ message: 'Missing appointment ID' }, { status: 400 });

    const updateData: Record<string, any> = {};
    for (const key of ALLOWED_UPDATE_FIELDS) {
      if (key in rest) updateData[key] = rest[key];
    }

    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'waitlist'];
    let mongoUpdate: any;
    if (status) {
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ message: 'Invalid status' }, { status: 400 });
      }
      if (isBarber && !BARBER_STATUSES.includes(status)) {
        return NextResponse.json({ message: 'Barbers can confirm, complete or cancel their bookings' }, { status: 403 });
      }
      const log: AppointmentLog = {
        timestamp: new Date(),
        action: `status changed to ${status}`,
        changedBy: `${session.role}:${session.subjectId.toString()}`,
      };
      mongoUpdate = { $set: { ...updateData, status }, $push: { log } };
    } else {
      mongoUpdate = { $set: updateData };
    }

    const db = await getDatabase();
    const filter: Record<string, any> = { _id: new ObjectId(_id), tenantId: session.tenantId };
    if (isBarber) filter.barberId = session.barberId;

    const before = await db.collection<Appointment>('appointments').findOne(filter);
    if (!before) return NextResponse.json({ message: 'Appointment not found' }, { status: 404 });

    const result = await db.collection<Appointment>('appointments').findOneAndUpdate(filter, mongoUpdate, { returnDocument: 'after' });
    if (!result) return NextResponse.json({ message: 'Appointment not found' }, { status: 404 });

    if (status === 'completed') await awardLoyaltyOnce(db, result, session.tenantId);
    if (status && status !== before.status && (status === 'confirmed' || status === 'cancelled')) {
      await notifyCustomer(db, result, status, session.tenantId);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to update appointment', error: error.message }, { status: 500 });
  }
}

/**
 * Credits loyalty points for a completed visit, exactly once. The claim on the
 * appointment (setting loyaltyAwarded only if it isn't set yet) is what makes
 * it safe against re-saving "Completed" or two staff pressing it together.
 */
async function awardLoyaltyOnce(db: any, appt: Appointment, tenantId: ObjectId) {
  const claim = await db.collection('appointments').updateOne(
    { _id: appt._id, loyaltyAwarded: { $exists: false } },
    { $set: { loyaltyAwarded: true } }
  );
  if (!claim.modifiedCount) return;
  const service = await db.collection('services').findOne({ _id: appt.serviceId, tenantId }, { projection: { price: 1 } });
  const points = pointsForPrice(service?.price);
  if (points > 0) {
    await db.collection('customers').updateOne({ _id: appt.customerId }, { $inc: { [`loyaltyPoints.${tenantId.toString()}`]: points } });
  }
}

/** Emails the customer about a confirmation/cancellation. Never fails the status change. */
async function notifyCustomer(db: any, appt: Appointment, kind: 'confirmed' | 'cancelled', tenantId: ObjectId) {
  try {
    const [customer, tenant, barber, service] = await Promise.all([
      db.collection('customers').findOne({ _id: appt.customerId }, { projection: { name: 1, email: 1 } }),
      db.collection('tenants').findOne({ _id: tenantId }, { projection: { name: 1, slug: 1 } }),
      db.collection('barbers').findOne({ _id: appt.barberId }, { projection: { name: 1 } }),
      db.collection('services').findOne({ _id: appt.serviceId }, { projection: { name: 1 } }),
    ]);
    if (!customer?.email || !tenant) return;
    await sendBookingEmail({
      kind, to: customer.email, customerName: customer.name, salonName: tenant.name, tenantSlug: tenant.slug,
      serviceName: service?.name, barberName: barber?.name, dateTime: appt.dateTime ? new Date(appt.dateTime) : new Date(),
    });
  } catch (err) {
    console.error('Booking status email failed:', err);
  }
}
