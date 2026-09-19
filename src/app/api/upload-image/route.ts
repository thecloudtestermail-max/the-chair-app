// src/app/api/upload-image/route.ts
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { requireRole } from '@/lib/requireRole';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export async function POST(request: Request) {
  const session = await requireRole(request, ['admin', 'barber']);
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ message: 'No file provided' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ message: 'Unsupported file type' }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ message: 'File too large (max 5MB)' }, { status: 400 });
    }
    
    // Upload to Vercel Blob
    const blob = await put(file.name, file, {
      access: 'public',
      addRandomSuffix: true,
    });
    
    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { message: 'Failed to upload image', error: error.message },
      { status: 500 }
    );
  }
}
