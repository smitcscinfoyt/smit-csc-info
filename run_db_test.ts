import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { getPrimeStatus, hasPrimeAccess } from './artifacts/api-server/src/lib/prime-status.js';
import { getActivePrime } from './artifacts/api-server/src/routes/credits.js';
import { db, paymentsTable } from '@workspace/db';
import { eq, and, desc } from 'drizzle-orm';

// Mock DB
let mockDbRows = [];
const originalSelect = db.select;
db.select = () => {
    return {
        from: () => ({
            where: () => ({
                orderBy: () => ({
                    limit: () => mockDbRows
                })
            })
        })
    };
};

async function runTests() {
    console.log("=== STARTING TESTS ===");

    // Test (a): Expired outside grace (more than 3 days ago)
    mockDbRows = [{
        id: 1, userId: 1, status: 'success', 
        createdAt: new Date(), updatedAt: new Date(),
        expiryDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
    }];
    console.log("Test A - Expired > 3 days");
    console.log("getPrimeStatus:", await getPrimeStatus(1));
    console.log("hasPrimeAccess:", hasPrimeAccess(await getPrimeStatus(1)));
    console.log("getActivePrime:", await getActivePrime(1));
    console.log("---");

    // Test (b): Expired inside grace (1 day ago)
    mockDbRows = [{
        id: 1, userId: 1, status: 'success', 
        createdAt: new Date(), updatedAt: new Date(),
        expiryDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) // 1 day ago
    }];
    console.log("Test B - Expired inside grace (1 day ago)");
    console.log("getPrimeStatus:", await getPrimeStatus(1));
    console.log("hasPrimeAccess:", hasPrimeAccess(await getPrimeStatus(1)));
    console.log("getActivePrime:", (await getActivePrime(1)) !== null ? "Payment Object Returned" : "null");
    console.log("---");

    // Test (c): Manager role with NO prime
    // For this, we just test the API route to show it gets a 200, but we can't easily start the server with the mocked DB here.
    // Instead I'll just write it as a vitest script and run vitest!
}
runTests();
