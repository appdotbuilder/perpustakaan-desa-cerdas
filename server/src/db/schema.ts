import { serial, text, pgTable, timestamp, integer, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Define enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'member']);
export const bookStatusEnum = pgEnum('book_status', ['tersedia', 'dipinjam', 'rusak', 'hilang']);
export const borrowRequestStatusEnum = pgEnum('borrow_request_status', ['menunggu', 'disetujui', 'ditolak', 'selesai']);

// Users table
export const usersTable = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  password: text('password').notNull(), // Will store hashed password
  full_name: text('full_name').notNull(),
  email: text('email'), // Nullable
  phone: text('phone'), // Nullable
  address: text('address'), // Nullable
  role: userRoleEnum('role').notNull(),
  member_number: text('member_number'), // Nullable, only for members
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Books table
export const booksTable = pgTable('books', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  category: text('category').notNull(),
  author: text('author').notNull(),
  publisher: text('publisher').notNull(),
  publication_year: integer('publication_year').notNull(),
  page_count: integer('page_count').notNull(),
  isbn: text('isbn'), // Nullable
  total_stock: integer('total_stock').notNull(),
  available_stock: integer('available_stock').notNull(),
  shelf_location: text('shelf_location').notNull(),
  status: bookStatusEnum('status').notNull().default('tersedia'),
  description: text('description'), // Nullable
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Borrow requests table
export const borrowRequestsTable = pgTable('borrow_requests', {
  id: serial('id').primaryKey(),
  member_id: integer('member_id').notNull().references(() => usersTable.id),
  book_id: integer('book_id').notNull().references(() => booksTable.id),
  request_date: timestamp('request_date').defaultNow().notNull(),
  approved_date: timestamp('approved_date'), // Nullable
  due_date: timestamp('due_date'), // Nullable
  return_date: timestamp('return_date'), // Nullable
  status: borrowRequestStatusEnum('status').notNull().default('menunggu'),
  notes: text('notes'), // Nullable
  approved_by: integer('approved_by').references(() => usersTable.id), // Nullable, admin user id
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull()
});

// Define relations
export const usersRelations = relations(usersTable, ({ many }) => ({
  borrowRequests: many(borrowRequestsTable, { relationName: 'memberBorrowRequests' }),
  approvedRequests: many(borrowRequestsTable, { relationName: 'adminApprovedRequests' })
}));

export const booksRelations = relations(booksTable, ({ many }) => ({
  borrowRequests: many(borrowRequestsTable)
}));

export const borrowRequestsRelations = relations(borrowRequestsTable, ({ one }) => ({
  member: one(usersTable, {
    fields: [borrowRequestsTable.member_id],
    references: [usersTable.id],
    relationName: 'memberBorrowRequests'
  }),
  book: one(booksTable, {
    fields: [borrowRequestsTable.book_id],
    references: [booksTable.id]
  }),
  approver: one(usersTable, {
    fields: [borrowRequestsTable.approved_by],
    references: [usersTable.id],
    relationName: 'adminApprovedRequests'
  })
}));

// TypeScript types for the table schemas
export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type Book = typeof booksTable.$inferSelect;
export type NewBook = typeof booksTable.$inferInsert;

export type BorrowRequest = typeof borrowRequestsTable.$inferSelect;
export type NewBorrowRequest = typeof borrowRequestsTable.$inferInsert;

// Export all tables and relations for proper query building
export const tables = {
  users: usersTable,
  books: booksTable,
  borrowRequests: borrowRequestsTable
};

export const tableRelations = {
  usersRelations,
  booksRelations,
  borrowRequestsRelations
};