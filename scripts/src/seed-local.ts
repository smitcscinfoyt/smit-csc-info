import { db, usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
} else {
  dotenv.config();
}

const SECRET = process.env.SESSION_SECRET || 'local_secret';

const users = [
  {
    name: 'Free User',
    email: 'free@local.com',
    password: 'password123',
    role: 'user',
    primeStatus: 'inactive',
    primeExpiresAt: null,
  },
  {
    name: 'Prime Active',
    email: 'prime.active@local.com',
    password: 'password123',
    role: 'user',
    primeStatus: 'active',
    primeExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days future
  },
  {
    name: 'Prime Grace',
    email: 'prime.grace@local.com',
    password: 'password123',
    role: 'user',
    primeStatus: 'active',
    primeExpiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days past
  },
  {
    name: 'Prime Expired',
    email: 'prime.expired@local.com',
    password: 'password123',
    role: 'user',
    primeStatus: 'active',
    primeExpiresAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days past
  },
  {
    name: 'Admin',
    email: 'admin@local.com',
    password: 'password123',
    role: 'admin',
    primeStatus: 'inactive',
    primeExpiresAt: null,
  }
];

async function seed() {
  console.log('Seeding local users...');
  
  for (const u of users) {
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, u.email));
    let userId;
    if (existing.length === 0) {
      const [inserted] = await db.insert(usersTable).values(u).returning();
      userId = inserted.id;
      console.log(`Inserted ${u.name} (ID: ${userId})`);
    } else {
      userId = existing[0].id;
      await db.update(usersTable).set(u).where(eq(usersTable.id, userId));
      console.log(`Updated ${u.name} (ID: ${userId})`);
    }

    const token = jwt.sign({ userId, role: u.role }, SECRET, { expiresIn: '8h' });
    console.log(`\n--- TOKEN FOR ${u.name.toUpperCase()} ---`);
    console.log(token);
    console.log(`Email: ${u.email} | Password: ${u.password}\n`);
  }

  console.log('Seeding affidavits...');
  const seedFile = path.resolve(process.cwd(), 'seed-affidavits.sql');
  if (fs.existsSync(seedFile)) {
    const sql = fs.readFileSync(seedFile, 'utf8');
    // Simple split execution since drizzle run might not support multiple statements depending on dialect
    // Actually we can just run db.execute
    try {
       // @ts-ignore
       await db.execute(sql);
       console.log('Successfully executed seed-affidavits.sql');
    } catch (e) {
       console.log('Warning running sql seed directly:', e);
    }
  } else {
    console.log('No seed-affidavits.sql found in root.');
  }

  console.log('Local seed complete.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
