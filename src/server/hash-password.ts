import { hashPassword } from './password.js';

const password = process.argv[2];
if (!password) {
  console.error('Usage: npm run password:hash -- <password>');
  process.exitCode = 1;
} else {
  process.stdout.write(`${await hashPassword(password)}\n`);
}
