import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import 'dotenv/config';
import cors from 'cors';
import superjson from 'superjson';
import { z } from 'zod';

// Import schemas
import {
  loginInputSchema,
  createUserInputSchema,
  updateUserInputSchema,
  createBookInputSchema,
  updateBookInputSchema,
  bookSearchInputSchema,
  createBorrowRequestInputSchema,
  updateBorrowRequestInputSchema,
  returnBookInputSchema,
  borrowRequestSearchInputSchema
} from './schema';

// Import handlers
import { login, validateSession } from './handlers/auth';
import { 
  createUser, 
  getUsers, 
  getUserById, 
  updateUser, 
  deleteUser, 
  getMembers 
} from './handlers/users';
import { 
  createBook, 
  getBooks, 
  getBookById, 
  updateBook, 
  deleteBook, 
  getBooksByCategory, 
  getBookCategories, 
  searchBooks 
} from './handlers/books';
import { 
  createBorrowRequest, 
  getBorrowRequests, 
  getBorrowRequestsByMember, 
  getPendingBorrowRequests, 
  updateBorrowRequestStatus, 
  returnBook, 
  getOverdueBooks, 
  getActiveLoansByMember, 
  cancelBorrowRequest 
} from './handlers/borrow_requests';
import { 
  getDashboardStats, 
  getRecentActivities, 
  getPopularBooks, 
  getUsageAnalytics 
} from './handlers/dashboard';

const t = initTRPC.create({
  transformer: superjson,
});

const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
  // Health check
  healthcheck: publicProcedure.query(() => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }),

  // Authentication routes
  auth: router({
    login: publicProcedure
      .input(loginInputSchema)
      .mutation(({ input }) => login(input)),
    
    validateSession: publicProcedure
      .input(z.object({ userId: z.number() }))
      .query(({ input }) => validateSession(input.userId))
  }),

  // User management routes (mostly admin)
  users: router({
    create: publicProcedure
      .input(createUserInputSchema)
      .mutation(({ input }) => createUser(input)),
    
    getAll: publicProcedure
      .query(() => getUsers()),
    
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getUserById(input.id)),
    
    update: publicProcedure
      .input(updateUserInputSchema)
      .mutation(({ input }) => updateUser(input)),
    
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteUser(input.id)),
    
    getMembers: publicProcedure
      .query(() => getMembers())
  }),

  // Book management routes
  books: router({
    create: publicProcedure
      .input(createBookInputSchema)
      .mutation(({ input }) => createBook(input)),
    
    getAll: publicProcedure
      .input(bookSearchInputSchema.optional())
      .query(({ input }) => getBooks(input)),
    
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(({ input }) => getBookById(input.id)),
    
    update: publicProcedure
      .input(updateBookInputSchema)
      .mutation(({ input }) => updateBook(input)),
    
    delete: publicProcedure
      .input(z.object({ id: z.number() }))
      .mutation(({ input }) => deleteBook(input.id)),
    
    getByCategory: publicProcedure
      .input(z.object({ category: z.string() }))
      .query(({ input }) => getBooksByCategory(input.category)),
    
    getCategories: publicProcedure
      .query(() => getBookCategories()),
    
    search: publicProcedure
      .input(z.object({ query: z.string() }))
      .query(({ input }) => searchBooks(input.query))
  }),

  // Borrow request routes (circulation management)
  borrowRequests: router({
    create: publicProcedure
      .input(createBorrowRequestInputSchema)
      .mutation(({ input }) => createBorrowRequest(input)),
    
    getAll: publicProcedure
      .input(borrowRequestSearchInputSchema.optional())
      .query(({ input }) => getBorrowRequests(input)),
    
    getByMember: publicProcedure
      .input(z.object({ memberId: z.number() }))
      .query(({ input }) => getBorrowRequestsByMember(input.memberId)),
    
    getPending: publicProcedure
      .query(() => getPendingBorrowRequests()),
    
    updateStatus: publicProcedure
      .input(updateBorrowRequestInputSchema)
      .mutation(({ input }) => updateBorrowRequestStatus(input)),
    
    returnBook: publicProcedure
      .input(returnBookInputSchema)
      .mutation(({ input }) => returnBook(input)),
    
    getOverdue: publicProcedure
      .query(() => getOverdueBooks()),
    
    getActiveLoans: publicProcedure
      .input(z.object({ memberId: z.number() }))
      .query(({ input }) => getActiveLoansByMember(input.memberId)),
    
    cancel: publicProcedure
      .input(z.object({ requestId: z.number(), memberId: z.number() }))
      .mutation(({ input }) => cancelBorrowRequest(input.requestId, input.memberId))
  }),

  // Dashboard and analytics routes (admin only)
  dashboard: router({
    getStats: publicProcedure
      .query(() => getDashboardStats()),
    
    getRecentActivities: publicProcedure
      .query(() => getRecentActivities()),
    
    getPopularBooks: publicProcedure
      .query(() => getPopularBooks()),
    
    getUsageAnalytics: publicProcedure
      .query(() => getUsageAnalytics())
  })
});

export type AppRouter = typeof appRouter;

async function start() {
  const port = process.env['SERVER_PORT'] || 2022;
  const server = createHTTPServer({
    middleware: (req, res, next) => {
      cors()(req, res, next);
    },
    router: appRouter,
    createContext() {
      return {};
    },
  });
  server.listen(port);
  console.log(`🚀 TRPC server untuk Perpustakaan Desa Cerdas berjalan di port: ${port}`);
  console.log(`📚 Sistem perpustakaan desa dengan fitur lengkap telah siap!`);
}

start();