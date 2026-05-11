import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { token, message } = await request.json();
    if (!token) return NextResponse.json({ error: 'No Token' }, { status: 400 });

    const response = await fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${token}`,
      },
      body: new URLSearchParams({ message }),
    });

    return NextResponse.json({ success: response.ok });
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}