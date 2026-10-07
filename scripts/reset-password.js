// Resets a user's password and signs them out everywhere.
// Usage: node scripts/reset-password.js <username-or-email> <new-password>
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const [login, password] = process.argv.slice(2);
if (!login || !password || password.length < 8) {
  console.error('Usage: node scripts/reset-password.js <username-or-email> <new-password (8+ chars)>');
  process.exit(1);
}

const prisma = new PrismaClient();
(async () => {
  const user = await prisma.user.findFirst({ where: { OR: [{ username: login }, { email: login }] } });
  if (!user) throw new Error(`No user "${login}".`);
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`, active: true },
  });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  console.log(`Password reset for ${user.username}.`);
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
