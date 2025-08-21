import { db } from '../db';
import { borrowRequestsTable, usersTable, booksTable } from '../db/schema';
import { 
    type CreateBorrowRequestInput, 
    type UpdateBorrowRequestInput, 
    type ReturnBookInput,
    type BorrowRequest, 
    type BorrowRequestWithDetails, 
    type BorrowRequestSearchInput,
    type PaginatedResponse 
} from '../schema';
import { eq, and, isNull, lt, sql, count, SQL } from 'drizzle-orm';

// Create a new borrow request (member only)
export async function createBorrowRequest(input: CreateBorrowRequestInput): Promise<BorrowRequest> {
    try {
        // Check if book exists and is available
        const books = await db.select()
            .from(booksTable)
            .where(eq(booksTable.id, input.book_id))
            .execute();

        if (books.length === 0) {
            throw new Error('Book not found');
        }

        const book = books[0];
        if (book.available_stock <= 0 || book.status !== 'tersedia') {
            throw new Error('Book is not available for borrowing');
        }

        // Check if member exists and has member role
        const members = await db.select()
            .from(usersTable)
            .where(and(
                eq(usersTable.id, input.member_id),
                eq(usersTable.role, 'member')
            ))
            .execute();

        if (members.length === 0) {
            throw new Error('Member not found');
        }

        // Check if member already has an active request for this book
        const existingRequests = await db.select()
            .from(borrowRequestsTable)
            .where(and(
                eq(borrowRequestsTable.member_id, input.member_id),
                eq(borrowRequestsTable.book_id, input.book_id),
                sql`${borrowRequestsTable.status} IN ('menunggu', 'disetujui')`
            ))
            .execute();

        if (existingRequests.length > 0) {
            throw new Error('You already have an active request for this book');
        }

        // Create the borrow request
        const result = await db.insert(borrowRequestsTable)
            .values({
                member_id: input.member_id,
                book_id: input.book_id,
                notes: input.notes,
                status: 'menunggu'
            })
            .returning()
            .execute();

        return result[0];
    } catch (error) {
        console.error('Create borrow request failed:', error);
        throw error;
    }
}

// Get all borrow requests with filters and pagination (admin)
export async function getBorrowRequests(input?: BorrowRequestSearchInput): Promise<PaginatedResponse<BorrowRequestWithDetails>> {
    try {
        const page = input?.page || 1;
        const limit = input?.limit || 10;
        const offset = (page - 1) * limit;

        // Apply filters
        const conditions: SQL<unknown>[] = [];

        if (input?.member_id) {
            conditions.push(eq(borrowRequestsTable.member_id, input.member_id));
        }

        if (input?.status) {
            conditions.push(eq(borrowRequestsTable.status, input.status));
        }

        // Build base query with joins
        const baseQuery = db.select({
            borrowRequest: borrowRequestsTable,
            member: {
                id: usersTable.id,
                username: usersTable.username,
                full_name: usersTable.full_name,
                email: usersTable.email,
                phone: usersTable.phone,
                address: usersTable.address,
                role: usersTable.role,
                member_number: usersTable.member_number,
                created_at: usersTable.created_at,
                updated_at: usersTable.updated_at
            },
            book: booksTable,
            approver: {
                id: usersTable.id,
                username: usersTable.username,
                full_name: usersTable.full_name,
                email: usersTable.email,
                phone: usersTable.phone,
                address: usersTable.address,
                role: usersTable.role,
                member_number: usersTable.member_number,
                created_at: usersTable.created_at,
                updated_at: usersTable.updated_at
            }
        })
        .from(borrowRequestsTable)
        .innerJoin(usersTable, eq(borrowRequestsTable.member_id, usersTable.id))
        .innerJoin(booksTable, eq(borrowRequestsTable.book_id, booksTable.id))
        .leftJoin(
            sql`${usersTable} AS approver_users`,
            eq(borrowRequestsTable.approved_by, sql`approver_users.id`)
        );

        // Apply where clause conditionally
        const query = conditions.length > 0 
            ? baseQuery.where(and(...conditions))
            : baseQuery;

        // Get total count for pagination
        const countQuery = conditions.length > 0 
            ? db.select({ count: count() }).from(borrowRequestsTable).where(and(...conditions))
            : db.select({ count: count() }).from(borrowRequestsTable);

        const [results, countResult] = await Promise.all([
            query.limit(limit).offset(offset).execute(),
            countQuery.execute()
        ]);

        const total = countResult[0].count;
        const totalPages = Math.ceil(total / limit);

        // Transform results to match expected structure
        const data: BorrowRequestWithDetails[] = results.map(result => ({
            ...result.borrowRequest,
            member: result.member,
            book: result.book,
            approver: result.approver
        }));

        return {
            data,
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        };
    } catch (error) {
        console.error('Get borrow requests failed:', error);
        throw error;
    }
}

// Get borrow requests by member ID (member's own requests)
export async function getBorrowRequestsByMember(memberId: number): Promise<BorrowRequestWithDetails[]> {
    try {
        const results = await db.select({
            borrowRequest: borrowRequestsTable,
            member: {
                id: usersTable.id,
                username: usersTable.username,
                full_name: usersTable.full_name,
                email: usersTable.email,
                phone: usersTable.phone,
                address: usersTable.address,
                role: usersTable.role,
                member_number: usersTable.member_number,
                created_at: usersTable.created_at,
                updated_at: usersTable.updated_at
            },
            book: booksTable,
            approver: {
                id: usersTable.id,
                username: usersTable.username,
                full_name: usersTable.full_name,
                email: usersTable.email,
                phone: usersTable.phone,
                address: usersTable.address,
                role: usersTable.role,
                member_number: usersTable.member_number,
                created_at: usersTable.created_at,
                updated_at: usersTable.updated_at
            }
        })
        .from(borrowRequestsTable)
        .innerJoin(usersTable, eq(borrowRequestsTable.member_id, usersTable.id))
        .innerJoin(booksTable, eq(borrowRequestsTable.book_id, booksTable.id))
        .leftJoin(
            sql`${usersTable} AS approver_users`,
            eq(borrowRequestsTable.approved_by, sql`approver_users.id`)
        )
        .where(eq(borrowRequestsTable.member_id, memberId))
        .execute();

        return results.map(result => ({
            ...result.borrowRequest,
            member: result.member,
            book: result.book,
            approver: result.approver
        }));
    } catch (error) {
        console.error('Get borrow requests by member failed:', error);
        throw error;
    }
}

// Get pending borrow requests (admin dashboard)
export async function getPendingBorrowRequests(): Promise<BorrowRequestWithDetails[]> {
    try {
        const results = await db.select({
            borrowRequest: borrowRequestsTable,
            member: {
                id: usersTable.id,
                username: usersTable.username,
                full_name: usersTable.full_name,
                email: usersTable.email,
                phone: usersTable.phone,
                address: usersTable.address,
                role: usersTable.role,
                member_number: usersTable.member_number,
                created_at: usersTable.created_at,
                updated_at: usersTable.updated_at
            },
            book: booksTable,
            approver: {
                id: usersTable.id,
                username: usersTable.username,
                full_name: usersTable.full_name,
                email: usersTable.email,
                phone: usersTable.phone,
                address: usersTable.address,
                role: usersTable.role,
                member_number: usersTable.member_number,
                created_at: usersTable.created_at,
                updated_at: usersTable.updated_at
            }
        })
        .from(borrowRequestsTable)
        .innerJoin(usersTable, eq(borrowRequestsTable.member_id, usersTable.id))
        .innerJoin(booksTable, eq(borrowRequestsTable.book_id, booksTable.id))
        .leftJoin(
            sql`${usersTable} AS approver_users`,
            eq(borrowRequestsTable.approved_by, sql`approver_users.id`)
        )
        .where(eq(borrowRequestsTable.status, 'menunggu'))
        .execute();

        return results.map(result => ({
            ...result.borrowRequest,
            member: result.member,
            book: result.book,
            approver: result.approver
        }));
    } catch (error) {
        console.error('Get pending borrow requests failed:', error);
        throw error;
    }
}

// Update borrow request status (admin only - approve/reject)
export async function updateBorrowRequestStatus(input: UpdateBorrowRequestInput): Promise<BorrowRequest> {
    try {
        // Get the current request
        const requests = await db.select()
            .from(borrowRequestsTable)
            .where(eq(borrowRequestsTable.id, input.id))
            .execute();

        if (requests.length === 0) {
            throw new Error('Borrow request not found');
        }

        const currentRequest = requests[0];

        // Prepare update data
        const updateData: any = {
            status: input.status,
            updated_at: new Date()
        };

        if (input.notes !== undefined) {
            updateData.notes = input.notes;
        }

        if (input.approved_by !== undefined) {
            updateData.approved_by = input.approved_by;
        }

        // If approving, set approval date and due date (14 days from now)
        if (input.status === 'disetujui') {
            const approvalDate = new Date();
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 14); // 14 days loan period

            updateData.approved_date = approvalDate;
            updateData.due_date = dueDate;

            // Decrease book available stock
            await db.update(booksTable)
                .set({ 
                    available_stock: sql`${booksTable.available_stock} - 1`,
                    updated_at: new Date()
                })
                .where(eq(booksTable.id, currentRequest.book_id))
                .execute();
        }

        // Update the borrow request
        const result = await db.update(borrowRequestsTable)
            .set(updateData)
            .where(eq(borrowRequestsTable.id, input.id))
            .returning()
            .execute();

        return result[0];
    } catch (error) {
        console.error('Update borrow request status failed:', error);
        throw error;
    }
}

// Process book return (admin only)
export async function returnBook(input: ReturnBookInput): Promise<BorrowRequest> {
    try {
        // Get the current request
        const requests = await db.select()
            .from(borrowRequestsTable)
            .where(eq(borrowRequestsTable.id, input.request_id))
            .execute();

        if (requests.length === 0) {
            throw new Error('Borrow request not found');
        }

        const currentRequest = requests[0];

        if (currentRequest.return_date) {
            throw new Error('Book has already been returned');
        }

        if (currentRequest.status !== 'disetujui') {
            throw new Error('Only approved requests can be returned');
        }

        // Update the borrow request
        const updateData: any = {
            status: 'selesai',
            return_date: new Date(),
            updated_at: new Date()
        };

        if (input.notes) {
            updateData.notes = input.notes;
        }

        const result = await db.update(borrowRequestsTable)
            .set(updateData)
            .where(eq(borrowRequestsTable.id, input.request_id))
            .returning()
            .execute();

        // Increase book available stock
        await db.update(booksTable)
            .set({ 
                available_stock: sql`${booksTable.available_stock} + 1`,
                updated_at: new Date()
            })
            .where(eq(booksTable.id, currentRequest.book_id))
            .execute();

        return result[0];
    } catch (error) {
        console.error('Return book failed:', error);
        throw error;
    }
}

// Get overdue books (admin dashboard)
export async function getOverdueBooks(): Promise<BorrowRequestWithDetails[]> {
    try {
        const now = new Date();

        const results = await db.select({
            borrowRequest: borrowRequestsTable,
            member: {
                id: usersTable.id,
                username: usersTable.username,
                full_name: usersTable.full_name,
                email: usersTable.email,
                phone: usersTable.phone,
                address: usersTable.address,
                role: usersTable.role,
                member_number: usersTable.member_number,
                created_at: usersTable.created_at,
                updated_at: usersTable.updated_at
            },
            book: booksTable,
            approver: {
                id: usersTable.id,
                username: usersTable.username,
                full_name: usersTable.full_name,
                email: usersTable.email,
                phone: usersTable.phone,
                address: usersTable.address,
                role: usersTable.role,
                member_number: usersTable.member_number,
                created_at: usersTable.created_at,
                updated_at: usersTable.updated_at
            }
        })
        .from(borrowRequestsTable)
        .innerJoin(usersTable, eq(borrowRequestsTable.member_id, usersTable.id))
        .innerJoin(booksTable, eq(borrowRequestsTable.book_id, booksTable.id))
        .leftJoin(
            sql`${usersTable} AS approver_users`,
            eq(borrowRequestsTable.approved_by, sql`approver_users.id`)
        )
        .where(and(
            eq(borrowRequestsTable.status, 'disetujui'),
            isNull(borrowRequestsTable.return_date),
            lt(borrowRequestsTable.due_date, now)
        ))
        .execute();

        return results.map(result => ({
            ...result.borrowRequest,
            member: result.member,
            book: result.book,
            approver: result.approver
        }));
    } catch (error) {
        console.error('Get overdue books failed:', error);
        throw error;
    }
}

// Get active loans by member (check loan limit)
export async function getActiveLoansByMember(memberId: number): Promise<BorrowRequestWithDetails[]> {
    try {
        const results = await db.select({
            borrowRequest: borrowRequestsTable,
            member: {
                id: usersTable.id,
                username: usersTable.username,
                full_name: usersTable.full_name,
                email: usersTable.email,
                phone: usersTable.phone,
                address: usersTable.address,
                role: usersTable.role,
                member_number: usersTable.member_number,
                created_at: usersTable.created_at,
                updated_at: usersTable.updated_at
            },
            book: booksTable,
            approver: {
                id: usersTable.id,
                username: usersTable.username,
                full_name: usersTable.full_name,
                email: usersTable.email,
                phone: usersTable.phone,
                address: usersTable.address,
                role: usersTable.role,
                member_number: usersTable.member_number,
                created_at: usersTable.created_at,
                updated_at: usersTable.updated_at
            }
        })
        .from(borrowRequestsTable)
        .innerJoin(usersTable, eq(borrowRequestsTable.member_id, usersTable.id))
        .innerJoin(booksTable, eq(borrowRequestsTable.book_id, booksTable.id))
        .leftJoin(
            sql`${usersTable} AS approver_users`,
            eq(borrowRequestsTable.approved_by, sql`approver_users.id`)
        )
        .where(and(
            eq(borrowRequestsTable.member_id, memberId),
            eq(borrowRequestsTable.status, 'disetujui'),
            isNull(borrowRequestsTable.return_date)
        ))
        .execute();

        return results.map(result => ({
            ...result.borrowRequest,
            member: result.member,
            book: result.book,
            approver: result.approver
        }));
    } catch (error) {
        console.error('Get active loans by member failed:', error);
        throw error;
    }
}

// Cancel borrow request (member only - before approval)
export async function cancelBorrowRequest(requestId: number, memberId: number): Promise<boolean> {
    try {
        // Get the current request
        const requests = await db.select()
            .from(borrowRequestsTable)
            .where(and(
                eq(borrowRequestsTable.id, requestId),
                eq(borrowRequestsTable.member_id, memberId)
            ))
            .execute();

        if (requests.length === 0) {
            throw new Error('Borrow request not found or you do not have permission to cancel it');
        }

        const currentRequest = requests[0];

        if (currentRequest.status !== 'menunggu') {
            throw new Error('Only pending requests can be cancelled');
        }

        // Update status to rejected
        await db.update(borrowRequestsTable)
            .set({ 
                status: 'ditolak',
                updated_at: new Date(),
                notes: 'Cancelled by member'
            })
            .where(eq(borrowRequestsTable.id, requestId))
            .execute();

        return true;
    } catch (error) {
        console.error('Cancel borrow request failed:', error);
        throw error;
    }
}