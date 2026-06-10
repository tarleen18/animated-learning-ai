import { PrismaClient } from '@prisma/client';

let globalForPrisma = globalThis;

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = new PrismaClient();
}

export default globalForPrisma.prisma;
