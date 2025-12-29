import { NextResponse } from 'next/server';
import { getStats, isCacheValid } from '@/lib/stats';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // Check if cache is valid
    const cacheValid = isCacheValid();
    
    // If cache is expired or doesn't exist, fetch fresh data
    // Otherwise return cached data
    const stats = await getStats(!cacheValid);
    
    return NextResponse.json(stats, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
      },
    });
  } catch (error) {
    console.error('Error in API route:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}

