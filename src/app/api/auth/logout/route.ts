// src/app/api/auth/logout/route.ts
//
// One "Sign out" for everyone: ends the staff session and the customer
// session (whichever exist) and clears both cookies.
import { NextResponse } from 'next/server';
import { deleteSession } from '@/lib/auth';
import { deleteClaimSession } from '@/lib/customerAuth';
import { clearAuthCookies, readCookie, STAFF_COOKIE, CUSTOMER_COOKIE } from '@/lib/authCookies';

export async function POST(request: Request) {
  try {
    await Promise.all([
      deleteSession(readCookie(request, STAFF_COOKIE)),
      deleteClaimSession(readCookie(request, CUSTOMER_COOKIE)),
    ]);
    const response = NextResponse.json({ message: 'Logged out' });
    clearAuthCookies(response);
    return response;
  } catch (error: any) {
    console.error('Logout error:', error);
    return NextResponse.json({ message: 'Logout failed' }, { status: 500 });
  }
}
