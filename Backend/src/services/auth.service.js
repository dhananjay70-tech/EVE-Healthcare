const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { eq } = require('drizzle-orm');
const { db } = require('../db');
const { users } = require('../db/schema/users');
const env = require('../config/env');
const AppError = require('../utils/AppError');

const SALT_ROUNDS = 10;
// Postgres' unique_violation code, raised when the email unique constraint is hit.
const UNIQUE_VIOLATION = '23505';

function toSafeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function findUserByEmail(email) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user;
}

async function findUserById(id) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user;
}

async function signup({ name, email, password }) {
  const existing = await findUserByEmail(email);

  if (existing) {
    throw new AppError(409, 'An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    const [created] = await db.insert(users).values({ name, email, passwordHash }).returning();
    return toSafeUser(created);
  } catch (err) {
    // Guards against a race between the existence check above and the insert.
    if (err.code === UNIQUE_VIOLATION) {
      throw new AppError(409, 'An account with this email already exists');
    }
    throw err;
  }
}

async function login({ email, password }) {
  const user = await findUserByEmail(email);

  if (!user) {
    throw new AppError(401, 'Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError(401, 'Invalid email or password');
  }

  const token = jwt.sign({ sub: user.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

  return { token, user: toSafeUser(user) };
}

module.exports = { signup, login, findUserByEmail, findUserById, toSafeUser };
