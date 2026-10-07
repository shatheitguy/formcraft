// Resets a user's password and signs them out everywhere — for when no admin can sign in.
// Usage: node scripts/reset-password.js <username-or-email> <new-password> [--disable-2fa]
// In Docker:  docker exec -it formcraft reset-password <username-or-email> <new-password> [--disable-2fa]
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const args = process.argv.slice(2);
const disable2fa = args.includes('--disable-2fa');
const [login, password] = args.filter((a) => a !== '--disable-2fa');
if (!login || !password || password.length < 8) {
  console.error('Usage: reset-password <username-or-email> <new-password (8+ chars)> [--disable-2fa]');
  process.exit(1);
}

const prisma = new PrismaClient();
(async () => {
  const user = await prisma.user.findFirst({ where: { OR: [{ username: login }, { email: login }] } });
  if (!user) throw new Error(`No user "${login}".`);
  // Same format as hashPassword() in lib/auth.ts.
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  const data = { passwordHash: `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`, active: true };
  // Same fields as an admin's "Reset two-factor" (app/api/admin/users/[id]/route.ts).
  if (disable2fa) Object.assign(data, { totpEnabled: false, totpSecret: null, totpPendingSecret: null, totpLastStep: null, emailOtpEnabled: false, recoveryCodes: '[]' });
  await prisma.user.update({ where: { id: user.id }, data });
  await prisma.session.deleteMany({ where: { userId: user.id } });
  if (disable2fa) await prisma.loginChallenge.deleteMany({ where: { userId: user.id } });
  console.log(`Password reset for ${user.username}${disable2fa ? ', two-factor sign-in turned off' : ''}. They have been signed out everywhere.`);
  if (!disable2fa && (user.totpEnabled || user.emailOtpEnabled)) console.log('Note: two-factor sign-in is still on for this account. Add --disable-2fa to turn it off.');
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
