import { db } from '../db';
import { usersTable, borrowRequestsTable } from '../db/schema';
import { type CreateUserInput, type UpdateUserInput, type User } from '../schema';
import { eq, count } from 'drizzle-orm';

// Simple password hashing function (in production, use bcrypt or similar)
function hashPassword(password: string): string {
  // Simple hash for demo - in production use bcrypt
  return Buffer.from(password).toString('base64');
}

// Generate member number for new members
async function generateMemberNumber(): Promise<string> {
  const memberCount = await db
    .select({ count: count() })
    .from(usersTable)
    .where(eq(usersTable.role, 'member'))
    .execute();
  
  const nextNumber = (memberCount[0]?.count || 0) + 1;
  return `MEMBER${nextNumber.toString().padStart(3, '0')}`;
}

// Create a new user (admin or member registration)
export async function createUser(input: CreateUserInput): Promise<User> {
  try {
    const hashedPassword = hashPassword(input.password);
    const memberNumber = input.role === 'member' ? await generateMemberNumber() : null;
    
    const result = await db.insert(usersTable)
      .values({
        username: input.username,
        password: hashedPassword,
        full_name: input.full_name,
        email: input.email,
        phone: input.phone,
        address: input.address,
        role: input.role,
        member_number: memberNumber
      })
      .returning()
      .execute();

    return result[0];
  } catch (error) {
    console.error('User creation failed:', error);
    throw error;
  }
}

// Get all users with optional filtering (admin only)
export async function getUsers(): Promise<User[]> {
  try {
    const result = await db.select()
      .from(usersTable)
      .execute();

    return result;
  } catch (error) {
    console.error('Failed to fetch users:', error);
    throw error;
  }
}

// Get user by ID
export async function getUserById(id: number): Promise<User | null> {
  try {
    const result = await db.select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .execute();

    return result[0] || null;
  } catch (error) {
    console.error('Failed to fetch user by ID:', error);
    throw error;
  }
}

// Update user information
export async function updateUser(input: UpdateUserInput): Promise<User> {
  try {
    // Build update values object, only including provided fields
    const updateValues: any = {
      updated_at: new Date()
    };

    if (input.username !== undefined) updateValues.username = input.username;
    if (input.password !== undefined) updateValues.password = hashPassword(input.password);
    if (input.full_name !== undefined) updateValues.full_name = input.full_name;
    if (input.email !== undefined) updateValues.email = input.email;
    if (input.phone !== undefined) updateValues.phone = input.phone;
    if (input.address !== undefined) updateValues.address = input.address;
    if (input.role !== undefined) updateValues.role = input.role;

    const result = await db.update(usersTable)
      .set(updateValues)
      .where(eq(usersTable.id, input.id))
      .returning()
      .execute();

    if (result.length === 0) {
      throw new Error('User not found');
    }

    return result[0];
  } catch (error) {
    console.error('User update failed:', error);
    throw error;
  }
}

// Delete user (admin only)
export async function deleteUser(id: number): Promise<boolean> {
  try {
    // Check if user has active borrow requests
    const activeBorrows = await db.select({ count: count() })
      .from(borrowRequestsTable)
      .where(eq(borrowRequestsTable.member_id, id))
      .execute();

    if (activeBorrows[0]?.count > 0) {
      throw new Error('Cannot delete user with active borrow requests');
    }

    const result = await db.delete(usersTable)
      .where(eq(usersTable.id, id))
      .execute();

    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    console.error('User deletion failed:', error);
    throw error;
  }
}

// Get all members (for admin interface)
export async function getMembers(): Promise<User[]> {
  try {
    const result = await db.select()
      .from(usersTable)
      .where(eq(usersTable.role, 'member'))
      .execute();

    return result;
  } catch (error) {
    console.error('Failed to fetch members:', error);
    throw error;
  }
}