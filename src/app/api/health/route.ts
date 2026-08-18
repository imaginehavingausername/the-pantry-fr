import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

// Singleton pattern for Prisma Client
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Shared health-check logic used by GET and HEAD.
 */
async function checkHealth() {
  const health: {
    status: string;
    timestamp: string;
    services: Record<string, string>;
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {},
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    health.services.database = 'connected';
  } catch {
    health.status = 'degraded';
    health.services.database = 'disconnected';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  return { health, statusCode };
}

/**
 * GET /api/health — Health check endpoint for the Alexa API.
 * Returns the status of the API and database connectivity.
 */
export async function GET() {
  const { health, statusCode } = await checkHealth();
  return NextResponse.json(health, { status: statusCode });
}

/**
 * HEAD /api/health — Lightweight health check for monitoring services
 * (UptimeRobot, Pingdom, StatusCake, etc.). Returns headers only.
 */
export async function HEAD() {
  const { statusCode } = await checkHealth();
  return new NextResponse(null, { status: statusCode });
}
