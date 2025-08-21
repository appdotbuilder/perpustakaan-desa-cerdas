import { z } from 'zod';

// Enum schemas
export const userRoleSchema = z.enum(['admin', 'member']);
export const bookStatusSchema = z.enum(['tersedia', 'dipinjam', 'rusak', 'hilang']);
export const borrowRequestStatusSchema = z.enum(['menunggu', 'disetujui', 'ditolak', 'selesai']);

// User schemas
export const userSchema = z.object({
  id: z.number(),
  username: z.string(),
  password: z.string(), // Will be hashed
  full_name: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  role: userRoleSchema,
  member_number: z.string().nullable(), // Only for members
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type User = z.infer<typeof userSchema>;

// User input schemas
export const createUserInputSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
  full_name: z.string().min(1).max(100),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  role: userRoleSchema
});

export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z.object({
  id: z.number(),
  username: z.string().min(3).max(50).optional(),
  password: z.string().min(6).optional(),
  full_name: z.string().min(1).max(100).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  role: userRoleSchema.optional()
});

export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

// Auth schemas
export const loginInputSchema = z.object({
  username: z.string(),
  password: z.string()
});

export type LoginInput = z.infer<typeof loginInputSchema>;

export const authResponseSchema = z.object({
  success: z.boolean(),
  user: userSchema.omit({ password: true }).nullable(),
  message: z.string()
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

// Book schemas
export const bookSchema = z.object({
  id: z.number(),
  title: z.string(),
  category: z.string(),
  author: z.string(),
  publisher: z.string(),
  publication_year: z.number().int(),
  page_count: z.number().int(),
  isbn: z.string().nullable(),
  total_stock: z.number().int().nonnegative(),
  available_stock: z.number().int().nonnegative(),
  shelf_location: z.string(),
  status: bookStatusSchema,
  description: z.string().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type Book = z.infer<typeof bookSchema>;

// Book input schemas
export const createBookInputSchema = z.object({
  title: z.string().min(1).max(200),
  category: z.string().min(1).max(50),
  author: z.string().min(1).max(100),
  publisher: z.string().min(1).max(100),
  publication_year: z.number().int().min(1000).max(new Date().getFullYear()),
  page_count: z.number().int().positive(),
  isbn: z.string().nullable(),
  total_stock: z.number().int().positive(),
  shelf_location: z.string().min(1).max(50),
  description: z.string().nullable()
});

export type CreateBookInput = z.infer<typeof createBookInputSchema>;

export const updateBookInputSchema = z.object({
  id: z.number(),
  title: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(50).optional(),
  author: z.string().min(1).max(100).optional(),
  publisher: z.string().min(1).max(100).optional(),
  publication_year: z.number().int().min(1000).max(new Date().getFullYear()).optional(),
  page_count: z.number().int().positive().optional(),
  isbn: z.string().nullable().optional(),
  total_stock: z.number().int().positive().optional(),
  shelf_location: z.string().min(1).max(50).optional(),
  status: bookStatusSchema.optional(),
  description: z.string().nullable().optional()
});

export type UpdateBookInput = z.infer<typeof updateBookInputSchema>;

// Borrow request schemas
export const borrowRequestSchema = z.object({
  id: z.number(),
  member_id: z.number(),
  book_id: z.number(),
  request_date: z.coerce.date(),
  approved_date: z.coerce.date().nullable(),
  due_date: z.coerce.date().nullable(),
  return_date: z.coerce.date().nullable(),
  status: borrowRequestStatusSchema,
  notes: z.string().nullable(),
  approved_by: z.number().nullable(), // admin user id
  created_at: z.coerce.date(),
  updated_at: z.coerce.date()
});

export type BorrowRequest = z.infer<typeof borrowRequestSchema>;

// Borrow request with relations
export const borrowRequestWithDetailsSchema = borrowRequestSchema.extend({
  member: userSchema.omit({ password: true }),
  book: bookSchema,
  approver: userSchema.omit({ password: true }).nullable()
});

export type BorrowRequestWithDetails = z.infer<typeof borrowRequestWithDetailsSchema>;

// Borrow request input schemas
export const createBorrowRequestInputSchema = z.object({
  member_id: z.number(),
  book_id: z.number(),
  notes: z.string().nullable()
});

export type CreateBorrowRequestInput = z.infer<typeof createBorrowRequestInputSchema>;

export const updateBorrowRequestInputSchema = z.object({
  id: z.number(),
  status: borrowRequestStatusSchema,
  notes: z.string().nullable().optional(),
  approved_by: z.number().nullable().optional()
});

export type UpdateBorrowRequestInput = z.infer<typeof updateBorrowRequestInputSchema>;

export const returnBookInputSchema = z.object({
  request_id: z.number(),
  notes: z.string().nullable()
});

export type ReturnBookInput = z.infer<typeof returnBookInputSchema>;

// Dashboard schemas
export const dashboardStatsSchema = z.object({
  total_books: z.number(),
  total_members: z.number(),
  total_borrowed: z.number(),
  pending_requests: z.number(),
  overdue_books: z.number(),
  available_books: z.number()
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

// Search and filter schemas
export const bookSearchInputSchema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  author: z.string().optional(),
  status: bookStatusSchema.optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional()
});

export type BookSearchInput = z.infer<typeof bookSearchInputSchema>;

export const borrowRequestSearchInputSchema = z.object({
  member_id: z.number().optional(),
  status: borrowRequestStatusSchema.optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional()
});

export type BorrowRequestSearchInput = z.infer<typeof borrowRequestSearchInputSchema>;

// Response schemas for paginated results
export const paginatedResponseSchema = <T>(itemSchema: z.ZodType<T>) => z.object({
  data: z.array(itemSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number()
  })
});

export type PaginatedResponse<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};