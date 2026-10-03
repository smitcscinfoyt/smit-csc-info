import { getPrimeStatus, type PrimeStatus, hasPrimeAccess } from './artifacts/api-server/src/lib/prime-status.js';

// Test 1: Active
const activeStatus: PrimeStatus = {
  payment: { id: 1, userId: 1, status: 'success', createdAt: new Date(), updatedAt: new Date(), amount: 100, paymentId: '1', orderId: '1', expiryDate: new Date(Date.now() + 10000) } as any,
  isActive: true,
  isInGracePeriod: false,
  isExpired: false,
  hasEverBeenPrime: true,
  daysUntilExpiry: 1,
  daysSinceExpiry: null,
  expiryDate: new Date(),
  graceEndsAt: new Date()
};

console.log('Active has access?', hasPrimeAccess(activeStatus));

// Test 2: Expired, past grace
const expiredStatus: PrimeStatus = {
  payment: { id: 1, userId: 1, status: 'success', createdAt: new Date(), updatedAt: new Date(), amount: 100, paymentId: '1', orderId: '1', expiryDate: new Date(Date.now() - 1000000000) } as any,
  isActive: false,
  isInGracePeriod: false,
  isExpired: true,
  hasEverBeenPrime: true,
  daysUntilExpiry: null,
  daysSinceExpiry: 10,
  expiryDate: new Date(),
  graceEndsAt: new Date()
};

console.log('Expired has access?', hasPrimeAccess(expiredStatus));

