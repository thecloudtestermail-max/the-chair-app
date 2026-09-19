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
import { ObjectId } from 'mongodb';

export const dynamic = 'force-dynamic';

const ALLOWED_UPDATE_FIELDS = ['notes'];

export async function GET(req: NextRequest) {
  const session = await requireRole(req, ['admin', 'receptionist', 'barber']);
  if (!session?.tenantId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  // A barber-role session only ever sees their own schedule, never the
  // whole salon's — the session already carries `barberId` (set at login,
  // see api/auth/login and api/staff/accept), so this is a straight match,
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

export async function PUT(req: NextRequest) {
  const session = await requireRole(req, ['admin', 'receptionist']);
  if (!session?.tenantId) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

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
    const result = await db.collection<Appointment>('appointments').findOneAndUpdate(
      { _id: new ObjectId(_id), tenantId: session.tenantId },
      mongoUpdate,
      { returnDocument: 'after' }
    );

    if (!result) return NextResponse.json({ message: 'Appointment not found' }, { status: 404 });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to update appointment', error: error.message }, { status: 500 });
  }
}
