import { db } from '../db';
import { usersTable } from '../db/schema';
import { type LoginInput, type AuthResponse, userSchema } from '../schema';
import { eq } from 'drizzle-orm';

// Define user without password type
type UserWithoutPassword = Omit<typeof usersTable.$inferSelect, 'password'>;

// Simple password hashing utility using built-in Node.js crypto
async function hashPassword(password: string): Promise<string> {
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  const hashedInput = await hashPassword(password);
  return hashedInput === hashedPassword;
}

// Authentication handler - validates user credentials and returns user info
export async function login(input: LoginInput): Promise<AuthResponse> {
  try {
    // Find user by username
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.username, input.username))
      .execute();

    if (users.length === 0) {
      return {
        success: false,
        user: null,
        message: 'Username atau password salah'
      };
    }

    const user = users[0];

    // Verify password
    const isValidPassword = await verifyPassword(input.password, user.password);
    
    if (!isValidPassword) {
      return {
        success: false,
        user: null,
        message: 'Username atau password salah'
      };
    }

    // Return successful authentication without password
    const { password: _, ...userWithoutPassword } = user;
    
    return {
      success: true,
      user: userWithoutPassword,
      message: 'Login berhasil'
    };
  } catch (error) {
    console.error('Login failed:', error);
    return {
      success: false,
      user: null,
      message: 'Terjadi kesalahan sistem'
    };
  }
}

// Validate current session/token - for protected routes
export async function validateSession(userId: number): Promise<UserWithoutPassword | null> {
  try {
    // Find user by ID
    const users = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .execute();

    if (users.length === 0) {
      return null;
    }

    const user = users[0];
    
    // Return user info without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  } catch (error) {
    console.error('Session validation failed:', error);
    return null;
  }
}

// Export password utilities for use in user creation
export { hashPassword };