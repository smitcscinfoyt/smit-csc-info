import { test, describe, it, vi } from 'vitest';
import { expect } from 'vitest';

const mockDbRows = [];

vi.mock('@workspace/db', () => {
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => mockDbRows
            })
          })
        })
      })
    },
    paymentsTable: {
      userId: 'userId',
      status: 'status',
      createdAt: 'createdAt',
      id: 'id'
    }
  };
});

import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { getPrimeStatus, hasPrimeAccess } from '../src/lib/prime-status.js';
import { getActivePrime } from '../src/routes/credits.js';

test('1. Expired outside grace (403)', async () => {
    mockDbRows.length = 0;
    mockDbRows.push({
        id: 1, userId: 1, status: 'success', 
        createdAt: new Date(), updatedAt: new Date(),
        expiryDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
    });
    
    const status = await getPrimeStatus(1);
    const hasAccess = hasPrimeAccess(status);
    const activePrime = await getActivePrime(1);

    console.log("=== EXPIRED PAST GRACE ===");
    console.log("status.isExpired:", status.isExpired);
    console.log("hasPrimeAccess:", hasAccess);
    console.log("getActivePrime:", activePrime !== null ? "Payment Object" : "null");
    
    // We would expect a 403 here because activePrime is null.
});

test('2. Expired inside grace (200)', async () => {
    mockDbRows.length = 0;
    mockDbRows.push({
        id: 1, userId: 1, status: 'success', 
        createdAt: new Date(), updatedAt: new Date(),
        expiryDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
    });
    
    const status = await getPrimeStatus(1);
    const hasAccess = hasPrimeAccess(status);
    const activePrime = await getActivePrime(1);

    console.log("=== EXPIRED INSIDE GRACE ===");
    console.log("status.isInGracePeriod:", status.isInGracePeriod);
    console.log("hasPrimeAccess:", hasAccess);
    console.log("getActivePrime:", activePrime !== null ? "Payment Object" : "null");
});

test('3. Manager role NO prime (200)', async () => {
    // For manager role, we test the actual router because it evaluates req.userRole
    const { default: router } = await import('../src/routes/sahayak.js');
    const app = express();
    app.use(express.json());
    
    // Mock the auth middleware to just inject the role
    app.use((req, res, next) => {
      req.userId = 1;
      req.userRole = 'manager';
      next();
    });
    
    app.use('/api', router);

    const server = http.createServer(app);
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;
    
    // DB returns null for prime
    mockDbRows.length = 0;

    const res = await fetch('http://localhost:' + port + '/api/sahayak/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi', history: [] })
    });

    console.log("=== MANAGER WITH NO PRIME ===");
    console.log("HTTP Status:", res.status);
    
    await new Promise(r => server.close(r));
});
