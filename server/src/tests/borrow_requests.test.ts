import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { usersTable, booksTable, borrowRequestsTable } from '../db/schema';
import { 
    type CreateBorrowRequestInput, 
    type UpdateBorrowRequestInput, 
    type ReturnBookInput,
    type BorrowRequestSearchInput 
} from '../schema';
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
} from '../handlers/borrow_requests';
import { eq, and } from 'drizzle-orm';

// Test data
let testMemberId: number;
let testAdminId: number;
let testBookId: number;

const createTestData = async () => {
    // Create test member
    const memberResult = await db.insert(usersTable)
        .values({
            username: 'testmember',
            password: 'hashedpassword',
            full_name: 'Test Member',
            email: 'member@test.com',
            role: 'member',
            member_number: 'M001'
        })
        .returning()
        .execute();
    testMemberId = memberResult[0].id;

    // Create test admin
    const adminResult = await db.insert(usersTable)
        .values({
            username: 'testadmin',
            password: 'hashedpassword',
            full_name: 'Test Admin',
            email: 'admin@test.com',
            role: 'admin'
        })
        .returning()
        .execute();
    testAdminId = adminResult[0].id;

    // Create test book
    const bookResult = await db.insert(booksTable)
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
            status: 'tersedia'
        })
        .returning()
        .execute();
    testBookId = bookResult[0].id;
};

describe('Borrow Requests Handlers', () => {
    beforeEach(async () => {
        await createDB();
        await createTestData();
    });
    afterEach(resetDB);

    describe('createBorrowRequest', () => {
        it('should create a borrow request successfully', async () => {
            const input: CreateBorrowRequestInput = {
                member_id: testMemberId,
                book_id: testBookId,
                notes: 'Test borrow request'
            };

            const result = await createBorrowRequest(input);

            expect(result.id).toBeDefined();
            expect(result.member_id).toEqual(testMemberId);
            expect(result.book_id).toEqual(testBookId);
            expect(result.status).toEqual('menunggu');
            expect(result.notes).toEqual('Test borrow request');
            expect(result.approved_date).toBeNull();
            expect(result.due_date).toBeNull();
            expect(result.return_date).toBeNull();
            expect(result.approved_by).toBeNull();
            expect(result.created_at).toBeInstanceOf(Date);
        });

        it('should save borrow request to database', async () => {
            const input: CreateBorrowRequestInput = {
                member_id: testMemberId,
                book_id: testBookId,
                notes: 'Test request'
            };

            const result = await createBorrowRequest(input);

            const savedRequests = await db.select()
                .from(borrowRequestsTable)
                .where(eq(borrowRequestsTable.id, result.id))
                .execute();

            expect(savedRequests).toHaveLength(1);
            expect(savedRequests[0].member_id).toEqual(testMemberId);
            expect(savedRequests[0].book_id).toEqual(testBookId);
            expect(savedRequests[0].status).toEqual('menunggu');
        });

        it('should fail when book does not exist', async () => {
            const input: CreateBorrowRequestInput = {
                member_id: testMemberId,
                book_id: 99999,
                notes: null
            };

            await expect(createBorrowRequest(input)).rejects.toThrow(/book not found/i);
        });

        it('should fail when book is not available', async () => {
            // Update book to have no available stock
            await db.update(booksTable)
                .set({ available_stock: 0 })
                .where(eq(booksTable.id, testBookId))
                .execute();

            const input: CreateBorrowRequestInput = {
                member_id: testMemberId,
                book_id: testBookId,
                notes: null
            };

            await expect(createBorrowRequest(input)).rejects.toThrow(/not available for borrowing/i);
        });

        it('should fail when member does not exist', async () => {
            const input: CreateBorrowRequestInput = {
                member_id: 99999,
                book_id: testBookId,
                notes: null
            };

            await expect(createBorrowRequest(input)).rejects.toThrow(/member not found/i);
        });

        it('should fail when member already has active request for same book', async () => {
            const input: CreateBorrowRequestInput = {
                member_id: testMemberId,
                book_id: testBookId,
                notes: null
            };

            // Create first request
            await createBorrowRequest(input);

            // Try to create second request for same book
            await expect(createBorrowRequest(input)).rejects.toThrow(/already have an active request/i);
        });
    });

    describe('getBorrowRequests', () => {
        it('should get all borrow requests with pagination', async () => {
            // Create multiple borrow requests
            for (let i = 0; i < 3; i++) {
                await db.insert(borrowRequestsTable)
                    .values({
                        member_id: testMemberId,
                        book_id: testBookId,
                        notes: `Request ${i + 1}`,
                        status: 'menunggu'
                    })
                    .execute();
            }

            const input: BorrowRequestSearchInput = {
                page: 1,
                limit: 2
            };

            const result = await getBorrowRequests(input);

            expect(result.data).toHaveLength(2);
            expect(result.pagination.page).toEqual(1);
            expect(result.pagination.limit).toEqual(2);
            expect(result.pagination.total).toEqual(3);
            expect(result.pagination.totalPages).toEqual(2);

            // Check structure of returned data
            const firstRequest = result.data[0];
            expect(firstRequest.id).toBeDefined();
            expect(firstRequest.member).toBeDefined();
            expect(firstRequest.member.full_name).toEqual('Test Member');
            expect(firstRequest.book).toBeDefined();
            expect(firstRequest.book.title).toEqual('Test Book');
            expect(firstRequest.approver).toBeDefined();
        });

        it('should filter by member_id', async () => {
            // Create another member and request
            const member2Result = await db.insert(usersTable)
                .values({
                    username: 'member2',
                    password: 'password',
                    full_name: 'Member 2',
                    role: 'member',
                    member_number: 'M002'
                })
                .returning()
                .execute();

            await db.insert(borrowRequestsTable)
                .values({
                    member_id: testMemberId,
                    book_id: testBookId,
                    status: 'menunggu'
                })
                .execute();

            await db.insert(borrowRequestsTable)
                .values({
                    member_id: member2Result[0].id,
                    book_id: testBookId,
                    status: 'menunggu'
                })
                .execute();

            const input: BorrowRequestSearchInput = {
                member_id: testMemberId
            };

            const result = await getBorrowRequests(input);

            expect(result.data).toHaveLength(1);
            expect(result.data[0].member_id).toEqual(testMemberId);
        });

        it('should filter by status', async () => {
            await db.insert(borrowRequestsTable)
                .values({
                    member_id: testMemberId,
                    book_id: testBookId,
                    status: 'menunggu'
                })
                .execute();

            await db.insert(borrowRequestsTable)
                .values({
                    member_id: testMemberId,
                    book_id: testBookId,
                    status: 'disetujui',
                    approved_date: new Date(),
                    due_date: new Date()
                })
                .execute();

            const input: BorrowRequestSearchInput = {
                status: 'menunggu'
            };

            const result = await getBorrowRequests(input);

            expect(result.data).toHaveLength(1);
            expect(result.data[0].status).toEqual('menunggu');
        });
    });

    describe('getBorrowRequestsByMember', () => {
        it('should get all requests for a specific member', async () => {
            // Create requests for test member
            await db.insert(borrowRequestsTable)
                .values({
                    member_id: testMemberId,
                    book_id: testBookId,
                    status: 'menunggu'
                })
                .execute();

            const result = await getBorrowRequestsByMember(testMemberId);

            expect(result).toHaveLength(1);
            expect(result[0].member_id).toEqual(testMemberId);
            expect(result[0].member.full_name).toEqual('Test Member');
            expect(result[0].book.title).toEqual('Test Book');
        });

        it('should return empty array for member with no requests', async () => {
            const result = await getBorrowRequestsByMember(testMemberId);
            expect(result).toHaveLength(0);
        });
    });

    describe('getPendingBorrowRequests', () => {
        it('should get only pending requests', async () => {
            await db.insert(borrowRequestsTable)
                .values({
                    member_id: testMemberId,
                    book_id: testBookId,
                    status: 'menunggu'
                })
                .execute();

            await db.insert(borrowRequestsTable)
                .values({
                    member_id: testMemberId,
                    book_id: testBookId,
                    status: 'disetujui',
                    approved_date: new Date(),
                    due_date: new Date()
                })
                .execute();

            const result = await getPendingBorrowRequests();

            expect(result).toHaveLength(1);
            expect(result[0].status).toEqual('menunggu');
            expect(result[0].member.full_name).toEqual('Test Member');
        });
    });

    describe('updateBorrowRequestStatus', () => {
        it('should approve a borrow request', async () => {
            const requestResult = await db.insert(borrowRequestsTable)
                .values({
                    member_id: testMemberId,
                    book_id: testBookId,
                    status: 'menunggu'
                })
                .returning()
                .execute();

            const input: UpdateBorrowRequestInput = {
                id: requestResult[0].id,
                status: 'disetujui',
                approved_by: testAdminId,
                notes: 'Approved by admin'
            };

            const result = await updateBorrowRequestStatus(input);

            expect(result.status).toEqual('disetujui');
            expect(result.approved_by).toEqual(testAdminId);
            expect(result.approved_date).toBeInstanceOf(Date);
            expect(result.due_date).toBeInstanceOf(Date);
            expect(result.notes).toEqual('Approved by admin');

            // Check that book available stock decreased
            const books = await db.select()
                .from(booksTable)
                .where(eq(booksTable.id, testBookId))
                .execute();
            expect(books[0].available_stock).toEqual(4);
        });

        it('should reject a borrow request', async () => {
            const requestResult = await db.insert(borrowRequestsTable)
                .values({
                    member_id: testMemberId,
                    book_id: testBookId,
                    status: 'menunggu'
                })
                .returning()
                .execute();

            const input: UpdateBorrowRequestInput = {
                id: requestResult[0].id,
                status: 'ditolak',
                notes: 'Book not available'
            };

            const result = await updateBorrowRequestStatus(input);

            expect(result.status).toEqual('ditolak');
            expect(result.approved_date).toBeNull();
            expect(result.due_date).toBeNull();

            // Check that book stock remained the same
            const books = await db.select()
                .from(booksTable)
                .where(eq(booksTable.id, testBookId))
                .execute();
            expect(books[0].available_stock).toEqual(5);
        });

        it('should fail when request not found', async () => {
            const input: UpdateBorrowRequestInput = {
                id: 99999,
                status: 'disetujui'
            };

            await expect(updateBorrowRequestStatus(input)).rejects.toThrow(/request not found/i);
        });
    });

    describe('returnBook', () => {
        it('should process book return successfully', async () => {
            // Create and approve a request first
            const requestResult = await db.insert(borrowRequestsTable)
                .values({
                    member_id: testMemberId,
                    book_id: testBookId,
                    status: 'disetujui',
                    approved_date: new Date(),
                    due_date: new Date(),
                    approved_by: testAdminId
                })
                .returning()
                .execute();

            // Update book stock to simulate the approval
            await db.update(booksTable)
                .set({ available_stock: 4 })
                .where(eq(booksTable.id, testBookId))
                .execute();

            const input: ReturnBookInput = {
                request_id: requestResult[0].id,
                notes: 'Book returned in good condition'
            };

            const result = await returnBook(input);

            expect(result.status).toEqual('selesai');
            expect(result.return_date).toBeInstanceOf(Date);
            expect(result.notes).toEqual('Book returned in good condition');

            // Check that book stock increased
            const books = await db.select()
                .from(booksTable)
                .where(eq(booksTable.id, testBookId))
                .execute();
            expect(books[0].available_stock).toEqual(5);
        });

        it('should fail when request not found', async () => {
            const input: ReturnBookInput = {
                request_id: 99999,
                notes: null
            };

            await expect(returnBook(input)).rejects.toThrow(/request not found/i);
        });

        it('should fail when request is not approved', async () => {
            const requestResult = await db.insert(borrowRequestsTable)
                .values({
                    member_id: testMemberId,
                    book_id: testBookId,
                    status: 'menunggu'
                })
                .returning()
                .execute();

            const input: ReturnBookInput = {
                request_id: requestResult[0].id,
                notes: null
            };

            await expect(returnBook(input)).rejects.toThrow(/only approved requests can be returned/i);
        });

        it('should fail when book already returned', async () => {
            const requestResult = await db.insert(borrowRequestsTable)
                .values({
                    member_id: testMemberId,
                    book_id: testBookId,
                    status: 'selesai',
                    approved_date: new Date(),
                    due_date: new Date(),
                    return_date: new Date(),
                    approved_by: testAdminId
                })
                .returning()
                .execute();

            const input: ReturnBookInput = {
                request_id: requestResult[0].id,
                notes: null
            };

            await expect(returnBook(input)).rejects.toThrow(/already been returned/i);
        });
    });

    describe('getOverdueBooks', () => {
        it('should get overdue books', async () => {
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 1); // Yesterday

            await db.insert(borrowRequestsTable)
                .values({
                    member_id: testMemberId,
                    book_id: testBookId,
                    status: 'disetujui',
                    approved_date: new Date(),
                    due_date: pastDate, // Overdue
                    approved_by: testAdminId
                })
                .execute();

            const result = await getOverdueBooks();

            expect(result).toHaveLength(1);
            expect(result[0].status).toEqual('disetujui');
            expect(result[0].return_date).toBeNull();
            expect(result[0].due_date).toEqual(pastDate);
        });

        it('should not return books that are not overdue', async () => {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 1); // Tomorrow

            await db.insert(borrowRequestsTable)
                .values({
                    member_id: testMemberId,
                    book_id: testBookId,
                    status: 'disetujui',
                    approved_date: new Date(),
                    due_date: futureDate, // Not overdue
                    approved_by: testAdminId
                })
                .execute();

            const result = await getOverdueBooks();

            expect(result).toHaveLength(0);
        });

        it('should not return returned books', async () => {
            const pastDate = new Date();
            pastDate.setDate(pastDate.getDate() - 1);

            await db.insert(borrowRequestsTable)
                .values({
                    member_id: testMemberId,
                    book_id: testBookId,
                    status: 'selesai',
                    approved_date: new Date(),
                    due_date: pastDate,
                    return_date: new Date(), // Already returned
                    approved_by: testAdminId
                })
                .execute();

            const result = await getOverdueBooks();

            expect(result).toHaveLength(0);
        });
    });

    describe('getActiveLoansByMember', () => {
        it('should get active loans for member', async () => {
            await db.insert(borrowRequestsTable)
                .values({
                    member_id: testMemberId,
                    book_id: testBookId,
                    status: 'disetujui',
                    approved_date: new Date(),
                    due_date: new Date(),
                    approved_by: testAdminId
                })
                .execute();

            const result = await getActiveLoansByMember(testMemberId);

            expect(result).toHaveLength(1);
            expect(result[0].member_id).toEqual(testMemberId);
            expect(result[0].status).toEqual('disetujui');
            expect(result[0].return_date).toBeNull();
        });

        it('should not return completed loans', async () => {
            await db.insert(borrowRequestsTable)
                .values({
                    member_id: testMemberId,
                    book_id: testBookId,
                    status: 'selesai',
                    approved_date: new Date(),
                    due_date: new Date(),
                    return_date: new Date(),
                    approved_by: testAdminId
                })
                .execute();

            const result = await getActiveLoansByMember(testMemberId);

            expect(result).toHaveLength(0);
        });

        it('should return empty for member with no active loans', async () => {
            const result = await getActiveLoansByMember(testMemberId);
            expect(result).toHaveLength(0);
        });
    });

    describe('cancelBorrowRequest', () => {
        it('should cancel a pending request', async () => {
            const requestResult = await db.insert(borrowRequestsTable)
                .values({
                    member_id: testMemberId,
                    book_id: testBookId,
                    status: 'menunggu'
                })
                .returning()
                .execute();

            const result = await cancelBorrowRequest(requestResult[0].id, testMemberId);

            expect(result).toBe(true);

            // Check that request was updated
            const requests = await db.select()
                .from(borrowRequestsTable)
                .where(eq(borrowRequestsTable.id, requestResult[0].id))
                .execute();

            expect(requests[0].status).toEqual('ditolak');
            expect(requests[0].notes).toEqual('Cancelled by member');
        });

        it('should fail when request not found or not owned by member', async () => {
            await expect(cancelBorrowRequest(99999, testMemberId)).rejects.toThrow(/not found or you do not have permission/i);
        });

        it('should fail when request is not pending', async () => {
            const requestResult = await db.insert(borrowRequestsTable)
                .values({
                    member_id: testMemberId,
                    book_id: testBookId,
                    status: 'disetujui',
                    approved_date: new Date(),
                    due_date: new Date()
                })
                .returning()
                .execute();

            await expect(cancelBorrowRequest(requestResult[0].id, testMemberId)).rejects.toThrow(/only pending requests can be cancelled/i);
        });

        it('should fail when trying to cancel another members request', async () => {
            // Create another member
            const member2Result = await db.insert(usersTable)
                .values({
                    username: 'member2',
                    password: 'password',
                    full_name: 'Member 2',
                    role: 'member'
                })
                .returning()
                .execute();

            const requestResult = await db.insert(borrowRequestsTable)
                .values({
                    member_id: member2Result[0].id,
                    book_id: testBookId,
                    status: 'menunggu'
                })
                .returning()
                .execute();

            await expect(cancelBorrowRequest(requestResult[0].id, testMemberId)).rejects.toThrow(/not found or you do not have permission/i);
        });
    });
});