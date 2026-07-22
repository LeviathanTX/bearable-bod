import { NextResponse } from 'next/server';
import postgres from 'postgres';

export async function GET() {
  const dbUrl = process.env.DATABASE_URL || 'NOT SET';
  const masked = dbUrl.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');

  let dbStatus = 'not tested';
  try {
    const sql = postgres(dbUrl, { ssl: 'require', connect_timeout: 5 });
    const result = await sql`SELECT current_user, current_database(), version()`;
    await sql.end();
    dbStatus = JSON.stringify(result[0]);
  } catch (err: any) {
    dbStatus = `ERROR: ${err.message} | code: ${err.code} | errno: ${err.errno}`;
  }

  return NextResponse.json({
    env_masked: masked,
    dbStatus,
    region: process.env.PREBOARD_AWS_REGION || process.env.AWS_REGION || 'not set',
    nodeVersion: process.version,
  });
}
