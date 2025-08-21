import { db } from '../db';
import { usersTable, booksTable, borrowRequestsTable } from '../db/schema';
import { type DashboardStats } from '../schema';
import { eq, count, and, sql, desc } from 'drizzle-orm';

// Get dashboard statistics (admin only)
export async function getDashboardStats(): Promise<DashboardStats> {
  try {
    // Get total books count
    const totalBooksResult = await db.select({ count: count() })
      .from(booksTable)
      .execute();
    const total_books = totalBooksResult[0]?.count || 0;

    // Get total members count (excluding admins)
    const totalMembersResult = await db.select({ count: count() })
      .from(usersTable)
      .where(eq(usersTable.role, 'member'))
      .execute();
    const total_members = totalMembersResult[0]?.count || 0;

    // Get total currently borrowed books (approved and not returned)
    const totalBorrowedResult = await db.select({ count: count() })
      .from(borrowRequestsTable)
      .where(
        and(
          eq(borrowRequestsTable.status, 'disetujui'),
          sql`${borrowRequestsTable.return_date} IS NULL`
        )
      )
      .execute();
    const total_borrowed = totalBorrowedResult[0]?.count || 0;

    // Get pending requests count
    const pendingRequestsResult = await db.select({ count: count() })
      .from(borrowRequestsTable)
      .where(eq(borrowRequestsTable.status, 'menunggu'))
      .execute();
    const pending_requests = pendingRequestsResult[0]?.count || 0;

    // Get overdue books count (approved requests past due date and not returned)
    const currentDate = new Date();
    const overdueResult = await db.select({ count: count() })
      .from(borrowRequestsTable)
      .where(
        and(
          eq(borrowRequestsTable.status, 'disetujui'),
          sql`${borrowRequestsTable.return_date} IS NULL`,
          sql`${borrowRequestsTable.due_date} < ${currentDate}`
        )
      )
      .execute();
    const overdue_books = overdueResult[0]?.count || 0;

    // Calculate available books (sum of available stock for books with status 'tersedia')
    const availableBooksResult = await db.select({ 
      total: sql<number>`sum(${booksTable.available_stock})` 
    })
      .from(booksTable)
      .where(eq(booksTable.status, 'tersedia'))
      .execute();
    const available_books = Number(availableBooksResult[0]?.total) || 0;

    return {
      total_books,
      total_members,
      total_borrowed,
      pending_requests,
      overdue_books,
      available_books
    };
  } catch (error) {
    console.error('Failed to get dashboard stats:', error);
    throw error;
  }
}

// Get recent activities for dashboard (admin only)
export async function getRecentActivities(): Promise<any[]> {
  try {
    // Get recent borrow requests with member and book details
    const recentActivities = await db.select({
      id: borrowRequestsTable.id,
      type: sql<string>`'borrow_request'`,
      member_name: usersTable.full_name,
      book_title: booksTable.title,
      status: borrowRequestsTable.status,
      created_at: borrowRequestsTable.created_at,
      request_date: borrowRequestsTable.request_date,
      return_date: borrowRequestsTable.return_date
    })
      .from(borrowRequestsTable)
      .innerJoin(usersTable, eq(borrowRequestsTable.member_id, usersTable.id))
      .innerJoin(booksTable, eq(borrowRequestsTable.book_id, booksTable.id))
      .orderBy(desc(borrowRequestsTable.created_at))
      .limit(10)
      .execute();

    return recentActivities;
  } catch (error) {
    console.error('Failed to get recent activities:', error);
    throw error;
  }
}

// Get popular books (most borrowed) for dashboard
export async function getPopularBooks(): Promise<any[]> {
  try {
    // Get books with highest borrow count (including completed requests)
    const popularBooks = await db.select({
      book_id: booksTable.id,
      title: booksTable.title,
      author: booksTable.author,
      category: booksTable.category,
      borrow_count: sql<number>`count(${borrowRequestsTable.id})`
    })
      .from(booksTable)
      .innerJoin(borrowRequestsTable, eq(booksTable.id, borrowRequestsTable.book_id))
      .where(
        and(
          eq(borrowRequestsTable.status, 'disetujui'),
          sql`${borrowRequestsTable.approved_date} IS NOT NULL`
        )
      )
      .groupBy(booksTable.id, booksTable.title, booksTable.author, booksTable.category)
      .orderBy(desc(sql`count(${borrowRequestsTable.id})`))
      .limit(5)
      .execute();

    return popularBooks.map(book => ({
      ...book,
      borrow_count: Number(book.borrow_count) // Ensure it's a number
    }));
  } catch (error) {
    console.error('Failed to get popular books:', error);
    throw error;
  }
}

// Get library usage analytics (monthly stats)
export async function getUsageAnalytics(): Promise<any[]> {
  try {
    // Get monthly statistics for the past 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyStats = await db.select({
      month: sql<string>`to_char(${borrowRequestsTable.created_at}, 'YYYY-MM')`,
      total_requests: sql<number>`count(*)`,
      approved_requests: sql<number>`count(case when ${borrowRequestsTable.status} = 'disetujui' then 1 end)`,
      completed_requests: sql<number>`count(case when ${borrowRequestsTable.status} = 'selesai' then 1 end)`
    })
      .from(borrowRequestsTable)
      .where(sql`${borrowRequestsTable.created_at} >= ${sixMonthsAgo}`)
      .groupBy(sql`to_char(${borrowRequestsTable.created_at}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${borrowRequestsTable.created_at}, 'YYYY-MM')`)
      .execute();

    return monthlyStats.map(stat => ({
      ...stat,
      total_requests: Number(stat.total_requests),
      approved_requests: Number(stat.approved_requests),
      completed_requests: Number(stat.completed_requests)
    }));
  } catch (error) {
    console.error('Failed to get usage analytics:', error);
    throw error;
  }
}