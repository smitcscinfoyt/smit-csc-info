import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

// Load .env.local
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  const envContent = fs.readFileSync(envLocalPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  });
  console.log('Loaded .env.local');
} else {
  console.log('No .env.local found, skipping.');
}

console.log('Starting local development server...');

// Start API Server
const apiProcess = spawn('pnpm', ['--filter', '@workspace/api-server', 'run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: process.env
});

// Start Frontend
const frontendProcess = spawn('pnpm', ['--filter', '@workspace/smit-csc-info', 'run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: process.env
});

apiProcess.on('error', (err) => console.error('API Error:', err));
frontendProcess.on('error', (err) => console.error('Frontend Error:', err));

process.on('SIGINT', () => {
  apiProcess.kill('SIGINT');
  frontendProcess.kill('SIGINT');
  process.exit();
});
