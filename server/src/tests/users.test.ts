import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, borrowRequestsTable, booksTable } from '../db/schema';
import { type CreateUserInput, type UpdateUserInput } from '../schema';
import { 
  createUser, 
  getUsers, 
  getUserById, 
  updateUser, 
  deleteUser, 
  getMembers 
} from '../handlers/users';
import { eq } from 'drizzle-orm';

// Test input data
const adminInput: CreateUserInput = {
  username: 'admin_user',
  password: 'admin123',
  full_name: 'Admin User',
  email: 'admin@library.com',
  phone: '123-456-7890',
  address: '123 Admin St',
  role: 'admin'
};

const memberInput: CreateUserInput = {
  username: 'member_user',
  password: 'member123',
  full_name: 'Member User',
  email: 'member@library.com',
  phone: '098-765-4321',
  address: '456 Member Ave',
  role: 'member'
};

const memberInput2: CreateUserInput = {
  username: 'member_user2',
  password: 'member456',
  full_name: 'Second Member',
  email: 'member2@library.com',
  phone: null,
  address: null,
  role: 'member'
};

describe('User Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('createUser', () => {
    it('should create an admin user', async () => {
      const result = await createUser(adminInput);

      expect(result.username).toBe('admin_user');
      expect(result.full_name).toBe('Admin User');
      expect(result.email).toBe('admin@library.com');
      expect(result.phone).toBe('123-456-7890');
      expect(result.address).toBe('123 Admin St');
      expect(result.role).toBe('admin');
      expect(result.member_number).toBeNull();
      expect(result.id).toBeDefined();
      expect(result.created_at).toBeInstanceOf(Date);
      expect(result.updated_at).toBeInstanceOf(Date);
      // Password should be hashed, not plain text
      expect(result.password).not.toBe('admin123');
      expect(result.password).toBeDefined();
    });

    it('should create a member user with member number', async () => {
      const result = await createUser(memberInput);

      expect(result.username).toBe('member_user');
      expect(result.full_name).toBe('Member User');
      expect(result.role).toBe('member');
      expect(result.member_number).toBe('MEMBER001');
      expect(result.id).toBeDefined();
      // Password should be hashed
      expect(result.password).not.toBe('member123');
    });

    it('should create member with nullable fields', async () => {
      const result = await createUser(memberInput2);

      expect(result.username).toBe('member_user2');
      expect(result.full_name).toBe('Second Member');
      expect(result.email).toBe('member2@library.com');
      expect(result.phone).toBeNull();
      expect(result.address).toBeNull();
      expect(result.role).toBe('member');
      expect(result.member_number).toBe('MEMBER001');
    });

    it('should generate sequential member numbers', async () => {
      const member1 = await createUser(memberInput);
      const member2 = await createUser(memberInput2);

      expect(member1.member_number).toBe('MEMBER001');
      expect(member2.member_number).toBe('MEMBER002');
    });

    it('should save user to database', async () => {
      const result = await createUser(adminInput);

      const users = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, result.id))
        .execute();

      expect(users).toHaveLength(1);
      expect(users[0].username).toBe('admin_user');
      expect(users[0].role).toBe('admin');
    });

    it('should throw error for duplicate username', async () => {
      await createUser(adminInput);
      
      await expect(createUser(adminInput))
        .rejects
        .toThrow();
    });
  });

  describe('getUsers', () => {
    it('should return empty array when no users exist', async () => {
      const result = await getUsers();
      expect(result).toEqual([]);
    });

    it('should return all users', async () => {
      await createUser(adminInput);
      await createUser(memberInput);

      const result = await getUsers();
      
      expect(result).toHaveLength(2);
      expect(result.find(u => u.username === 'admin_user')).toBeDefined();
      expect(result.find(u => u.username === 'member_user')).toBeDefined();
    });

    it('should include passwords in results', async () => {
      await createUser(adminInput);
      
      const result = await getUsers();
      
      expect(result[0].password).toBeDefined();
      expect(result[0].password).not.toBe('admin123'); // Should be hashed
    });
  });

  describe('getUserById', () => {
    it('should return null when user does not exist', async () => {
      const result = await getUserById(999);
      expect(result).toBeNull();
    });

    it('should return user by ID', async () => {
      const created = await createUser(memberInput);
      
      const result = await getUserById(created.id);
      
      expect(result).not.toBeNull();
      expect(result!.id).toBe(created.id);
      expect(result!.username).toBe('member_user');
      expect(result!.role).toBe('member');
      expect(result!.member_number).toBe('MEMBER001');
    });

    it('should include password in result', async () => {
      const created = await createUser(adminInput);
      
      const result = await getUserById(created.id);
      
      expect(result!.password).toBeDefined();
      expect(result!.password).not.toBe('admin123'); // Should be hashed
    });
  });

  describe('updateUser', () => {
    it('should update user username', async () => {
      const created = await createUser(memberInput);
      
      const updateInput: UpdateUserInput = {
        id: created.id,
        username: 'updated_username'
      };
      
      const result = await updateUser(updateInput);
      
      expect(result.id).toBe(created.id);
      expect(result.username).toBe('updated_username');
      expect(result.full_name).toBe('Member User'); // Unchanged
      expect(result.updated_at).toBeInstanceOf(Date);
    });

    it('should update user password', async () => {
      const created = await createUser(memberInput);
      const originalPassword = created.password;
      
      const updateInput: UpdateUserInput = {
        id: created.id,
        password: 'newpassword123'
      };
      
      const result = await updateUser(updateInput);
      
      expect(result.password).not.toBe(originalPassword);
      expect(result.password).not.toBe('newpassword123'); // Should be hashed
    });

    it('should update multiple fields', async () => {
      const created = await createUser(memberInput);
      
      const updateInput: UpdateUserInput = {
        id: created.id,
        full_name: 'Updated Name',
        email: 'updated@email.com',
        phone: '999-888-7777',
        address: '999 Updated St'
      };
      
      const result = await updateUser(updateInput);
      
      expect(result.full_name).toBe('Updated Name');
      expect(result.email).toBe('updated@email.com');
      expect(result.phone).toBe('999-888-7777');
      expect(result.address).toBe('999 Updated St');
      expect(result.username).toBe('member_user'); // Unchanged
    });

    it('should update nullable fields to null', async () => {
      const created = await createUser(memberInput);
      
      const updateInput: UpdateUserInput = {
        id: created.id,
        email: null,
        phone: null,
        address: null
      };
      
      const result = await updateUser(updateInput);
      
      expect(result.email).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.address).toBeNull();
    });

    it('should throw error for non-existent user', async () => {
      const updateInput: UpdateUserInput = {
        id: 999,
        username: 'nonexistent'
      };
      
      await expect(updateUser(updateInput))
        .rejects
        .toThrow(/user not found/i);
    });

    it('should save changes to database', async () => {
      const created = await createUser(memberInput);
      
      const updateInput: UpdateUserInput = {
        id: created.id,
        full_name: 'Database Updated'
      };
      
      await updateUser(updateInput);
      
      const fromDb = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, created.id))
        .execute();
      
      expect(fromDb[0].full_name).toBe('Database Updated');
    });
  });

  describe('deleteUser', () => {
    it('should delete user successfully', async () => {
      const created = await createUser(adminInput);
      
      const result = await deleteUser(created.id);
      
      expect(result).toBe(true);
    });

    it('should return false for non-existent user', async () => {
      const result = await deleteUser(999);
      
      expect(result).toBe(false);
    });

    it('should remove user from database', async () => {
      const created = await createUser(adminInput);
      
      await deleteUser(created.id);
      
      const fromDb = await db.select()
        .from(usersTable)
        .where(eq(usersTable.id, created.id))
        .execute();
      
      expect(fromDb).toHaveLength(0);
    });

    it('should prevent deletion of user with active borrow requests', async () => {
      // Create user and book first
      const member = await createUser(memberInput);
      
      // Create a book for the borrow request
      const book = await db.insert(booksTable)
        .values({
          title: 'Test Book',
          category: 'Fiction',
          author: 'Test Author',
          publisher: 'Test Publisher',
          publication_year: 2023,
          page_count: 200,
          total_stock: 5,
          available_stock: 5,
          shelf_location: 'A1',
          description: 'Test book for borrow'
        })
        .returning()
        .execute();

      // Create borrow request
      await db.insert(borrowRequestsTable)
        .values({
          member_id: member.id,
          book_id: book[0].id,
          notes: 'Test borrow request'
        })
        .execute();
      
      await expect(deleteUser(member.id))
        .rejects
        .toThrow(/cannot delete user with active borrow requests/i);
    });
  });

  describe('getMembers', () => {
    it('should return empty array when no members exist', async () => {
      const result = await getMembers();
      expect(result).toEqual([]);
    });

    it('should return only members, not admins', async () => {
      await createUser(adminInput);
      await createUser(memberInput);
      await createUser(memberInput2);

      const result = await getMembers();
      
      expect(result).toHaveLength(2);
      expect(result.every(u => u.role === 'member')).toBe(true);
      expect(result.find(u => u.username === 'member_user')).toBeDefined();
      expect(result.find(u => u.username === 'member_user2')).toBeDefined();
      expect(result.find(u => u.username === 'admin_user')).toBeUndefined();
    });

    it('should include member numbers', async () => {
      await createUser(memberInput);
      
      const result = await getMembers();
      
      expect(result[0].member_number).toBe('MEMBER001');
      expect(result[0].role).toBe('member');
    });

    it('should include passwords in results', async () => {
      await createUser(memberInput);
      
      const result = await getMembers();
      
      expect(result[0].password).toBeDefined();
      expect(result[0].password).not.toBe('member123'); // Should be hashed
    });
  });
});