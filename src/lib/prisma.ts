import { PrismaClient } from "@prisma/client";

// Standard Next.js + Prisma singleton pattern. In dev, Next's hot-reload would
// otherwise create a new PrismaClient (and a new DB connection pool) on every file
// save, eventually exhausting your Supabase connection limit. Stashing the client on
// `globalThis` survives module re-evaluation in dev while staying a plain fresh
// instance in production.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}