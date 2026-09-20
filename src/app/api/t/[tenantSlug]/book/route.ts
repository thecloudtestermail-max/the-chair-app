// src/app/api/t/[tenantSlug]/book/route.ts
//
// Public, unauthenticated appointment booking. Tenant identity comes from the
// URL slug, resolved server-side — never from a client-supplied tenantId.
import { NextResponse } from 'next/server';
import { getDatabase } from '@/lib/mongodb';
import { resolveTenantBySlug } from '@/lib/resolveTenantBySlug';
import { Appointment, Customer } from '@/lib/types';
import { computeAvailableSlots, toBookedRange } from '@/lib/availability';
import { isValidEmail, normalizeEmail } from '@/lib/identity';
import { sendBookingEmail } from '@/lib/notifications';
import { ObjectId, WithId } from 'mongodb';

export const dynamic = 'force-dynamic';

// GET /api/t/[tenantSlug]/book?barberId=...&serviceId=...&date=YYYY-MM-DD
// New in Part 2 — the booking page used to be free-text date/time inputs
// with no idea what was actually available. Returns the bookable start
// times for that barber+service+day.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    const { tenantSlug } = await params;
    const tenant = await resolveTenantBySlug(tenantSlug);
    if (!tenant) return NextResponse.json({ message: 'Salon not found' }, { status: 404 });

    const url = new URL(req.url);
    const barberId = url.searchParams.get('barberId');
    const serviceId = url.searchParams.get('serviceId');
    const dateStr = url.searchParams.get('date'); // YYYY-MM-DD, local to the salon's own clock
    if (!barberId || !serviceId || !dateStr) {
      return NextResponse.json({ message: 'barberId, serviceId, and date are required' }, { status: 400 });
    }

    const db = await getDatabase();
    const [barber, service] = await Promise.all([
      db.collection('barbers').findOne({ _id: new ObjectId(barberId), tenantId: tenant._id }),
      db.collection('services').findOne({ _id: new ObjectId(serviceId), tenantId: tenant._id }),
    ]);
    if (!barber) return NextResponse.json({ message: 'Barber not found for this salon' }, { status: 400 });
    if (!service) return NextResponse.json({ message: 'Service not found for this salon' }, { status: 400 });

    const dayStart = new Date(`${dateStr}T00:00:00`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999`);

    const existing = await db
      .collection<Appointment>('appointments')
      .find({
        tenantId: tenant._id,
        barberId: new ObjectId(barberId),
        status: { $in: ['pending', 'confirmed'] },
        dateTime: { $gte: dayStart, $lte: dayEnd },
      })
      .toArray();

    // Each existing appointment blocks its own service's duration, not the
    // duration of the service being newly booked.
    const existingServiceIds = [...new Set(existing.map((a) => a.serviceId.toString()))].map((id) => new ObjectId(id));
    const existingServices = await db
      .collection('services')
      .find({ _id: { $in: existingServiceIds } }, { projection: { duration: 1 } })
      .toArray();
    const durationById = new Map(existingServices.map((s) => [s._id.toString(), s.duration]));

    const booked = existing.map((a) => toBookedRange(new Date(a.dateTime), durationById.get(a.serviceId.toString()) || 30));

    const slots = computeAvailableSlots(dayStart, barber.dailyAvailability || [], service.duration, booked);
    return NextResponse.json({ slots: slots.map((s) => s.toISOString()) });
  } catch (error: any) {
    return NextResponse.json({ message: 'Failed to compute availability', error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tenantSlug: string }> }
) {
  try {
    const { tenantSlug } = await params;
    const tenant = await resolveTenantBySlug(tenantSlug);
    if (!tenant) {
      return NextResponse.json({ message: 'Salon not found' }, { status: 404 });
    }

    const body = await req.json();
    const { customerName, customerPhone, serviceId, barberId, dateTime, notes } = body;
    // Emails are stored lower-cased everywhere, so one person is one record
    // however they capitalise it (and sign-in, which is by email, finds them).
    const customerEmail = normalizeEmail(body.customerEmail);

    if (!customerName || !customerEmail || !customerPhone || !serviceId || !barberId || !dateTime) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }
    if (!isValidEmail(customerEmail)) {
      return NextResponse.json({ message: 'Enter a valid email address' }, { status: 400 });
    }

    const db = await getDatabase();

    // Verify the service/barber actually belong to this tenant before booking —
    // prevents booking a service/barber that lives under a different tenant.
    const [service, barber] = await Promise.all([
      db.collection('services').findOne({ _id: new ObjectId(serviceId), tenantId: tenant._id }),
      db.collection('barbers').findOne({ _id: new ObjectId(barberId), tenantId: tenant._id }),
    ]);
    if (!service) return NextResponse.json({ message: 'Service not found for this salon' }, { status: 400 });
    if (!barber) return NextResponse.json({ message: 'Barber not found for this salon' }, { status: 400 });

    // Double-booking check (audit finding #9): re-derive this barber's free
    // slots for the requested day server-side and confirm the requested
    // dateTime is actually one of them, right before inserting. The GET
    // above shows the same computation to the client, but the client's
    // view can be stale by the time they submit — this is the check that
    // actually prevents two people claiming the same slot.
    const requested = new Date(dateTime);
    const dayStart = new Date(requested);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(requested);
    dayEnd.setHours(23, 59, 59, 999);

    const existing = await db
      .collection<Appointment>('appointments')
      .find({
        tenantId: tenant._id,
        barberId: new ObjectId(barberId),
        status: { $in: ['pending', 'confirmed'] },
        dateTime: { $gte: dayStart, $lte: dayEnd },
      })
      .toArray();
    const existingServiceIds = [...new Set(existing.map((a) => a.serviceId.toString()))].map((id) => new ObjectId(id));
    const existingServices = await db
      .collection('services')
      .find({ _id: { $in: existingServiceIds } }, { projection: { duration: 1 } })
      .toArray();
    const durationById = new Map(existingServices.map((s) => [s._id.toString(), s.duration]));
    const booked = existing.map((a) => toBookedRange(new Date(a.dateTime), durationById.get(a.serviceId.toString()) || 30));

    const availableSlots = computeAvailableSlots(dayStart, barber.dailyAvailability || [], service.duration, booked);
    const isAvailable = availableSlots.some((s) => Math.abs(s.getTime() - requested.getTime()) < 60_000);
    if (!isAvailable) {
      return NextResponse.json({ message: 'That time is no longer available — please pick another slot' }, { status: 409 });
    }

    // Find-or-create the customer by email, attach a loyalty entry for this tenant.
    let customer = await db.collection<Customer>('customers').findOne({ email: customerEmail });
    if (!customer) {
      const result = await db.collection<Customer>('customers').insertOne({
        name: customerName,
        email: customerEmail,
        phone: customerPhone,
        loyaltyPoints: { [tenant._id!.toString()]: 0 },
        createdAt: new Date(),
      });
      customer = { _id: result.insertedId } as WithId<Customer>;
    } else if (!(tenant._id!.toString() in (customer.loyaltyPoints || {}))) {
      await db.collection('customers').updateOne(
        { _id: customer._id },
        { $set: { [`loyaltyPoints.${tenant._id!.toString()}`]: 0 } }
      );
    }

    const appointment: Appointment = {
      tenantId: tenant._id!,
      customerId: customer._id!,
      barberId: new ObjectId(barberId),
      serviceId: new ObjectId(serviceId),
      dateTime: requested,
      status: 'pending',
      notes,
      log: [{ timestamp: new Date(), action: 'created', changedBy: 'customer' }],
    };

    const result = await db.collection<Appointment>('appointments').insertOne(appointment);

    // Best-effort "we've received your booking" email (a no-op without an email provider).
    await sendBookingEmail({
      kind: 'received', to: customerEmail, customerName, salonName: tenant.name, tenantSlug: tenant.slug,
      serviceName: service.name, barberName: barber.name, dateTime: requested,
    });

    return NextResponse.json({ _id: result.insertedId, ...appointment }, { status: 201 });
  } catch (error: any) {
    console.error('Booking error:', error);
    return NextResponse.json({ message: 'Failed to book appointment', error: error.message }, { status: 500 });
  }
}
