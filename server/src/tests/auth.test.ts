import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable } from '../db/schema';
import { type LoginInput } from '../schema';
import { login, validateSession, hashPassword } from '../handlers/auth';

// Test data
const testUser = {
  username: 'testuser',
  password: 'password123',
  full_name: 'Test User',
  email: 'test@example.com',
  phone: '+6281234567890',
  address: 'Jl. Test No. 123',
  role: 'member' as const,
  member_number: 'MB001'
};

const testAdmin = {
  username: 'admin',
  password: 'adminpass',
  full_name: 'Admin User',
  email: 'admin@library.com',
  phone: '+6289876543210',
  address: 'Jl. Admin No. 456',
  role: 'admin' as const,
  member_number: null
};

describe('Auth Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('login', () => {
    it('should successfully login with valid credentials', async () => {
      // Create test user with hashed password
      const hashedPassword = await hashPassword(testUser.password);
      
      const insertedUsers = await db.insert(usersTable)
        .values({
          ...testUser,
          password: hashedPassword
        })
        .returning()
        .execute();

      const insertedUser = insertedUsers[0];

      // Test login
      const loginInput: LoginInput = {
        username: testUser.username,
        password: testUser.password
      };

      const result = await login(loginInput);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.id).toBe(insertedUser.id);
      expect(result.user?.username).toBe(testUser.username);
      expect(result.user?.full_name).toBe(testUser.full_name);
      expect(result.user?.role).toBe(testUser.role);
      expect(result.user?.member_number).toBe(testUser.member_number);
      expect(result.message).toBe('Login berhasil');

      // Verify password is not included in response
      expect((result.user as any)?.password).toBeUndefined();
    });

    it('should fail login with invalid username', async () => {
      // Create test user
      const hashedPassword = await hashPassword(testUser.password);
      
      await db.insert(usersTable)
        .values({
          ...testUser,
          password: hashedPassword
        })
        .execute();

      // Test login with wrong username
      const loginInput: LoginInput = {
        username: 'wronguser',
        password: testUser.password
      };

      const result = await login(loginInput);

      expect(result.success).toBe(false);
      expect(result.user).toBeNull();
      expect(result.message).toBe('Username atau password salah');
    });

    it('should fail login with invalid password', async () => {
      // Create test user
      const hashedPassword = await hashPassword(testUser.password);
      
      await db.insert(usersTable)
        .values({
          ...testUser,
          password: hashedPassword
        })
        .execute();

      // Test login with wrong password
      const loginInput: LoginInput = {
        username: testUser.username,
        password: 'wrongpassword'
      };

      const result = await login(loginInput);

      expect(result.success).toBe(false);
      expect(result.user).toBeNull();
      expect(result.message).toBe('Username atau password salah');
    });

    it('should login admin user successfully', async () => {
      // Create admin user
      const hashedPassword = await hashPassword(testAdmin.password);
      
      const insertedAdmins = await db.insert(usersTable)
        .values({
          ...testAdmin,
          password: hashedPassword
        })
        .returning()
        .execute();

      const insertedAdmin = insertedAdmins[0];

      // Test admin login
      const loginInput: LoginInput = {
        username: testAdmin.username,
        password: testAdmin.password
      };

      const result = await login(loginInput);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.id).toBe(insertedAdmin.id);
      expect(result.user?.role).toBe('admin');
      expect(result.user?.member_number).toBeNull();
      expect(result.message).toBe('Login berhasil');
    });

    it('should handle empty credentials', async () => {
      const loginInput: LoginInput = {
        username: '',
        password: ''
      };

      const result = await login(loginInput);

      expect(result.success).toBe(false);
      expect(result.user).toBeNull();
      expect(result.message).toBe('Username atau password salah');
    });
  });

  describe('validateSession', () => {
    it('should validate existing user session', async () => {
      // Create test user
      const hashedPassword = await hashPassword(testUser.password);
      
      const insertedUsers = await db.insert(usersTable)
        .values({
          ...testUser,
          password: hashedPassword
        })
        .returning()
        .execute();

      const insertedUser = insertedUsers[0];

      // Validate session
      const result = await validateSession(insertedUser.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(insertedUser.id);
      expect(result?.username).toBe(testUser.username);
      expect(result?.full_name).toBe(testUser.full_name);
      expect(result?.role).toBe(testUser.role);

      // Verify password is not included in response
      expect((result as any)?.password).toBeUndefined();
    });

    it('should return null for non-existent user', async () => {
      const result = await validateSession(999);

      expect(result).toBeNull();
    });

    it('should validate admin user session', async () => {
      // Create admin user
      const hashedPassword = await hashPassword(testAdmin.password);
      
      const insertedAdmins = await db.insert(usersTable)
        .values({
          ...testAdmin,
          password: hashedPassword
        })
        .returning()
        .execute();

      const insertedAdmin = insertedAdmins[0];

      // Validate admin session
      const result = await validateSession(insertedAdmin.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(insertedAdmin.id);
      expect(result?.role).toBe('admin');
      expect(result?.member_number).toBeNull();
    });

    it('should handle invalid user ID formats', async () => {
      // Test with negative ID
      const result1 = await validateSession(-1);
      expect(result1).toBeNull();

      // Test with zero ID
      const result2 = await validateSession(0);
      expect(result2).toBeNull();
    });
  });

  describe('password hashing', () => {
    it('should hash passwords consistently', async () => {
      const password = 'testpassword123';
      
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(password);
      expect(hash1.length).toBe(64); // SHA-256 produces 64-character hex string
    });

    it('should produce different hashes for different passwords', async () => {
      const password1 = 'password123';
      const password2 = 'differentpass';

      const hash1 = await hashPassword(password1);
      const hash2 = await hashPassword(password2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('user data integrity', () => {
    it('should preserve all user fields except password', async () => {
      // Create user with all fields
      const hashedPassword = await hashPassword(testUser.password);
      
      const insertedUsers = await db.insert(usersTable)
        .values({
          ...testUser,
          password: hashedPassword
        })
        .returning()
        .execute();

      const insertedUser = insertedUsers[0];

      // Test both login and session validation
      const loginResult = await login({
        username: testUser.username,
        password: testUser.password
      });

      const sessionResult = await validateSession(insertedUser.id);

      // Verify all fields are preserved in both responses
      for (const result of [loginResult.user, sessionResult]) {
        expect(result?.username).toBe(testUser.username);
        expect(result?.full_name).toBe(testUser.full_name);
        expect(result?.email).toBe(testUser.email);
        expect(result?.phone).toBe(testUser.phone);
        expect(result?.address).toBe(testUser.address);
        expect(result?.role).toBe(testUser.role);
        expect(result?.member_number).toBe(testUser.member_number);
        expect(result?.created_at).toBeInstanceOf(Date);
        expect(result?.updated_at).toBeInstanceOf(Date);
      }
    });
  });
});