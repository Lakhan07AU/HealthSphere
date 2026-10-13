import { db, persist } from '../lib/db.js';
import { hashPassword } from '../lib/auth.js';
import { uid } from '../lib/util.js';

const email = 'admin123@healthsphere.ai';
if (db.users.find(u => u.email === email)) {
  console.log('Admin user already exists:', email);
} else {
  const { salt, hash } = hashPassword('Admin@1234');
  const user = {
    id: uid('usr'),
    email,
    name: 'Admin',
    passwordSalt: salt,
    passwordHash: hash,
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  persist();
  console.log('Admin user created:', email);
}
