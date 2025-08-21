import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, booksTable, borrowRequestsTable } from '../db/schema';
import { getDashboardStats, getRecentActivities, getPopularBooks, getUsageAnalytics } from '../handlers/dashboard';
import { eq } from 'drizzle-orm';

describe('Dashboard Handlers', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  describe('getDashboardStats', () => {
    it('should return zero stats for empty database', async () => {
      const stats = await getDashboardStats();

      expect(stats.total_books).toEqual(0);
      expect(stats.total_members).toEqual(0);
      expect(stats.total_borrowed).toEqual(0);
      expect(stats.pending_requests).toEqual(0);
      expect(stats.overdue_books).toEqual(0);
      expect(stats.available_books).toEqual(0);
    });

    it('should calculate correct dashboard statistics', async () => {
      // Create test admin user
      const adminResult = await db.insert(usersTable).values({
        username: 'admin',
        password: 'hashedpassword',
        full_name: 'Admin User',
        role: 'admin'
      }).returning().execute();
      const adminId = adminResult[0].id;

      // Create test member users
      await db.insert(usersTable).values([
        {
          username: 'member1',
          password: 'hashedpassword',
          full_name: 'Member One',
          role: 'member',
          member_number: 'M001'
        },
        {
          username: 'member2', 
          password: 'hashedpassword',
          full_name: 'Member Two',
          role: 'member',
          member_number: 'M002'
        }
      ]).execute();

      // Create test books
      await db.insert(booksTable).values([
        {
          title: 'Book 1',
          category: 'Fiction',
          author: 'Author 1',
          publisher: 'Publisher 1',
          publication_year: 2020,
          page_count: 200,
          total_stock: 5,
          available_stock: 3,
          shelf_location: 'A1',
          status: 'tersedia'
        },
        {
          title: 'Book 2',
          category: 'Science',
          author: 'Author 2', 
          publisher: 'Publisher 2',
          publication_year: 2021,
          page_count: 300,
          total_stock: 3,
          available_stock: 2,
          shelf_location: 'B1',
          status: 'tersedia'
        },
        {
          title: 'Book 3',
          category: 'History',
          author: 'Author 3',
          publisher: 'Publisher 3', 
          publication_year: 2019,
          page_count: 250,
          total_stock: 2,
          available_stock: 0,
          shelf_location: 'C1',
          status: 'rusak'
        }
      ]).execute();

      // Get member and book IDs for borrow requests
      const members = await db.select().from(usersTable).where(eq(usersTable.role, 'member')).execute();
      const books = await db.select().from(booksTable).execute();

      // Create borrow requests with different statuses
      const currentDate = new Date();
      const futureDate = new Date(currentDate);
      futureDate.setDate(futureDate.getDate() + 7);
      const pastDate = new Date(currentDate);
      pastDate.setDate(pastDate.getDate() - 7);

      await db.insert(borrowRequestsTable).values([
        {
          member_id: members[0].id,
          book_id: books[0].id,
          status: 'menunggu'
        },
        {
          member_id: members[1].id,
          book_id: books[1].id,
          status: 'disetujui',
          approved_date: currentDate,
          approved_by: adminId,
          due_date: futureDate
        },
        {
          member_id: members[0].id,
          book_id: books[2].id,
          status: 'disetujui',
          approved_date: pastDate,
          approved_by: adminId,
          due_date: pastDate // Overdue
        }
      ]).execute();

      const stats = await getDashboardStats();

      expect(stats.total_books).toEqual(3);
      expect(stats.total_members).toEqual(2); // Only members, not admin
      expect(stats.total_borrowed).toEqual(2); // Approved and not returned
      expect(stats.pending_requests).toEqual(1);
      expect(stats.overdue_books).toEqual(1); // One past due date
      expect(stats.available_books).toEqual(5); // 3 + 2 from available books only
    });

    it('should handle returned books correctly', async () => {
      // Create test data
      const adminResult = await db.insert(usersTable).values({
        username: 'admin',
        password: 'hashedpassword',
        full_name: 'Admin User',
        role: 'admin'
      }).returning().execute();

      const memberResult = await db.insert(usersTable).values({
        username: 'member1',
        password: 'hashedpassword',
        full_name: 'Member One',
        role: 'member',
        member_number: 'M001'
      }).returning().execute();

      const bookResult = await db.insert(booksTable).values({
        title: 'Test Book',
        category: 'Fiction',
        author: 'Test Author',
        publisher: 'Test Publisher',
        publication_year: 2020,
        page_count: 200,
        total_stock: 1,
        available_stock: 1,
        shelf_location: 'A1',
        status: 'tersedia'
      }).returning().execute();

      // Create returned borrow request
      await db.insert(borrowRequestsTable).values({
        member_id: memberResult[0].id,
        book_id: bookResult[0].id,
        status: 'disetujui',
        approved_date: new Date(),
        approved_by: adminResult[0].id,
        due_date: new Date(),
        return_date: new Date() // Book returned
      }).execute();

      const stats = await getDashboardStats();

      expect(stats.total_borrowed).toEqual(0); // Should not count returned books
      expect(stats.overdue_books).toEqual(0); // Should not count returned books
    });
  });

  describe('getRecentActivities', () => {
    it('should return empty array for no activities', async () => {
      const activities = await getRecentActivities();
      expect(activities).toEqual([]);
    });

    it('should return recent borrow requests with member and book details', async () => {
      // Create test data
      const memberResult = await db.insert(usersTable).values({
        username: 'member1',
        password: 'hashedpassword',
        full_name: 'John Doe',
        role: 'member',
        member_number: 'M001'
      }).returning().execute();

      const bookResult = await db.insert(booksTable).values({
        title: 'Test Book',
        category: 'Fiction',
        author: 'Test Author',
        publisher: 'Test Publisher',
        publication_year: 2020,
        page_count: 200,
        total_stock: 1,
        available_stock: 1,
        shelf_location: 'A1'
      }).returning().execute();

      await db.insert(borrowRequestsTable).values({
        member_id: memberResult[0].id,
        book_id: bookResult[0].id,
        status: 'menunggu'
      }).execute();

      const activities = await getRecentActivities();

      expect(activities).toHaveLength(1);
      expect(activities[0].type).toEqual('borrow_request');
      expect(activities[0].member_name).toEqual('John Doe');
      expect(activities[0].book_title).toEqual('Test Book');
      expect(activities[0].status).toEqual('menunggu');
      expect(activities[0].created_at).toBeInstanceOf(Date);
      expect(activities[0].request_date).toBeInstanceOf(Date);
    });

    it('should limit results to 10 activities', async () => {
      // Create test member and book
      const memberResult = await db.insert(usersTable).values({
        username: 'member1',
        password: 'hashedpassword',
        full_name: 'John Doe',
        role: 'member',
        member_number: 'M001'
      }).returning().execute();

      const bookResult = await db.insert(booksTable).values({
        title: 'Test Book',
        category: 'Fiction',
        author: 'Test Author',
        publisher: 'Test Publisher',
        publication_year: 2020,
        page_count: 200,
        total_stock: 15,
        available_stock: 15,
        shelf_location: 'A1'
      }).returning().execute();

      // Create 15 borrow requests
      const requests = Array.from({ length: 15 }, (_, i) => ({
        member_id: memberResult[0].id,
        book_id: bookResult[0].id,
        status: 'menunggu' as const
      }));

      await db.insert(borrowRequestsTable).values(requests).execute();

      const activities = await getRecentActivities();

      expect(activities).toHaveLength(10); // Should be limited to 10
    });
  });

  describe('getPopularBooks', () => {
    it('should return empty array for no borrows', async () => {
      const popularBooks = await getPopularBooks();
      expect(popularBooks).toEqual([]);
    });

    it('should return books ordered by borrow count', async () => {
      // Create test data
      const adminResult = await db.insert(usersTable).values({
        username: 'admin',
        password: 'hashedpassword',
        full_name: 'Admin User',
        role: 'admin'
      }).returning().execute();

      const memberResult = await db.insert(usersTable).values({
        username: 'member1',
        password: 'hashedpassword',
        full_name: 'John Doe',
        role: 'member',
        member_number: 'M001'
      }).returning().execute();

      const booksResult = await db.insert(booksTable).values([
        {
          title: 'Popular Book',
          category: 'Fiction',
          author: 'Popular Author',
          publisher: 'Publisher 1',
          publication_year: 2020,
          page_count: 200,
          total_stock: 5,
          available_stock: 5,
          shelf_location: 'A1'
        },
        {
          title: 'Less Popular Book',
          category: 'Science',
          author: 'Science Author',
          publisher: 'Publisher 2',
          publication_year: 2021,
          page_count: 300,
          total_stock: 3,
          available_stock: 3,
          shelf_location: 'B1'
        }
      ]).returning().execute();

      const currentDate = new Date();

      // Create multiple approved requests for first book
      await db.insert(borrowRequestsTable).values([
        {
          member_id: memberResult[0].id,
          book_id: booksResult[0].id,
          status: 'disetujui',
          approved_date: currentDate,
          approved_by: adminResult[0].id
        },
        {
          member_id: memberResult[0].id,
          book_id: booksResult[0].id,
          status: 'disetujui',
          approved_date: currentDate,
          approved_by: adminResult[0].id
        },
        {
          member_id: memberResult[0].id,
          book_id: booksResult[1].id,
          status: 'disetujui',
          approved_date: currentDate,
          approved_by: adminResult[0].id
        }
      ]).execute();

      const popularBooks = await getPopularBooks();

      expect(popularBooks).toHaveLength(2);
      expect(popularBooks[0].title).toEqual('Popular Book');
      expect(popularBooks[0].borrow_count).toEqual(2);
      expect(popularBooks[1].title).toEqual('Less Popular Book');
      expect(popularBooks[1].borrow_count).toEqual(1);
    });

    it('should only count approved requests', async () => {
      // Create test data
      const memberResult = await db.insert(usersTable).values({
        username: 'member1',
        password: 'hashedpassword',
        full_name: 'John Doe',
        role: 'member',
        member_number: 'M001'
      }).returning().execute();

      const bookResult = await db.insert(booksTable).values({
        title: 'Test Book',
        category: 'Fiction',
        author: 'Test Author',
        publisher: 'Test Publisher',
        publication_year: 2020,
        page_count: 200,
        total_stock: 2,
        available_stock: 2,
        shelf_location: 'A1'
      }).returning().execute();

      // Create requests with different statuses
      await db.insert(borrowRequestsTable).values([
        {
          member_id: memberResult[0].id,
          book_id: bookResult[0].id,
          status: 'menunggu' // Should not be counted
        },
        {
          member_id: memberResult[0].id,
          book_id: bookResult[0].id,
          status: 'ditolak' // Should not be counted
        }
      ]).execute();

      const popularBooks = await getPopularBooks();

      expect(popularBooks).toEqual([]); // Should not return any books
    });
  });

  describe('getUsageAnalytics', () => {
    it('should return empty array for no requests', async () => {
      const analytics = await getUsageAnalytics();
      expect(analytics).toEqual([]);
    });

    it('should return monthly usage statistics', async () => {
      // Create test data
      const adminResult = await db.insert(usersTable).values({
        username: 'admin',
        password: 'hashedpassword',
        full_name: 'Admin User',
        role: 'admin'
      }).returning().execute();

      const memberResult = await db.insert(usersTable).values({
        username: 'member1',
        password: 'hashedpassword',
        full_name: 'John Doe',
        role: 'member',
        member_number: 'M001'
      }).returning().execute();

      const bookResult = await db.insert(booksTable).values({
        title: 'Test Book',
        category: 'Fiction',
        author: 'Test Author',
        publisher: 'Test Publisher',
        publication_year: 2020,
        page_count: 200,
        total_stock: 5,
        available_stock: 5,
        shelf_location: 'A1'
      }).returning().execute();

      const currentDate = new Date();

      // Create requests with different statuses in current month
      await db.insert(borrowRequestsTable).values([
        {
          member_id: memberResult[0].id,
          book_id: bookResult[0].id,
          status: 'menunggu'
        },
        {
          member_id: memberResult[0].id,
          book_id: bookResult[0].id,
          status: 'disetujui',
          approved_date: currentDate,
          approved_by: adminResult[0].id
        },
        {
          member_id: memberResult[0].id,
          book_id: bookResult[0].id,
          status: 'selesai',
          approved_date: currentDate,
          approved_by: adminResult[0].id,
          return_date: currentDate
        }
      ]).execute();

      const analytics = await getUsageAnalytics();

      expect(analytics).toHaveLength(1);
      expect(analytics[0].month).toMatch(/^\d{4}-\d{2}$/); // Should be YYYY-MM format
      expect(analytics[0].total_requests).toEqual(3);
      expect(analytics[0].approved_requests).toEqual(1);
      expect(analytics[0].completed_requests).toEqual(1);
    });

    it('should only include requests from past 6 months', async () => {
      // Create test data
      const memberResult = await db.insert(usersTable).values({
        username: 'member1',
        password: 'hashedpassword',
        full_name: 'John Doe',
        role: 'member',
        member_number: 'M001'
      }).returning().execute();

      const bookResult = await db.insert(booksTable).values({
        title: 'Test Book',
        category: 'Fiction',
        author: 'Test Author',
        publisher: 'Test Publisher',
        publication_year: 2020,
        page_count: 200,
        total_stock: 2,
        available_stock: 2,
        shelf_location: 'A1'
      }).returning().execute();

      // Create request from 8 months ago (should not be included)
      const oldDate = new Date();
      oldDate.setMonth(oldDate.getMonth() - 8);

      await db.insert(borrowRequestsTable).values({
        member_id: memberResult[0].id,
        book_id: bookResult[0].id,
        status: 'menunggu',
        created_at: oldDate,
        request_date: oldDate
      }).execute();

      const analytics = await getUsageAnalytics();

      expect(analytics).toEqual([]); // Should not include old requests
    });
  });
});