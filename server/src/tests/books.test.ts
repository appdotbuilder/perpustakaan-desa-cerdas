import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { resetDB, createDB } from '../helpers';
import { db } from '../db';
import { booksTable } from '../db/schema';
import { type CreateBookInput } from '../schema';
import { createBook } from '../handlers/books';
import { eq } from 'drizzle-orm';

// Test input with all required fields
const testInput: CreateBookInput = {
  title: 'Test Book Title',
  category: 'Fiction',
  author: 'Test Author',
  publisher: 'Test Publisher',
  publication_year: 2023,
  page_count: 250,
  isbn: '978-0123456789',
  total_stock: 5,
  shelf_location: 'A1-01',
  description: 'A test book for unit testing'
};

// Test input with nullable fields
const minimalInput: CreateBookInput = {
  title: 'Minimal Book',
  category: 'Science',
  author: 'Minimal Author',
  publisher: 'Minimal Publisher',
  publication_year: 2024,
  page_count: 100,
  isbn: null,
  total_stock: 1,
  shelf_location: 'B2-05',
  description: null
};

describe('createBook', () => {
  beforeEach(createDB);
  afterEach(resetDB);

  it('should create a book with all fields', async () => {
    const result = await createBook(testInput);

    // Verify all fields are correctly set
    expect(result.title).toEqual('Test Book Title');
    expect(result.category).toEqual('Fiction');
    expect(result.author).toEqual('Test Author');
    expect(result.publisher).toEqual('Test Publisher');
    expect(result.publication_year).toEqual(2023);
    expect(result.page_count).toEqual(250);
    expect(result.isbn).toEqual('978-0123456789');
    expect(result.total_stock).toEqual(5);
    expect(result.available_stock).toEqual(5); // Should match total_stock initially
    expect(result.shelf_location).toEqual('A1-01');
    expect(result.status).toEqual('tersedia'); // Default status
    expect(result.description).toEqual('A test book for unit testing');
    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should create a book with minimal fields (nullable fields as null)', async () => {
    const result = await createBook(minimalInput);

    // Verify required fields
    expect(result.title).toEqual('Minimal Book');
    expect(result.category).toEqual('Science');
    expect(result.author).toEqual('Minimal Author');
    expect(result.publisher).toEqual('Minimal Publisher');
    expect(result.publication_year).toEqual(2024);
    expect(result.page_count).toEqual(100);
    expect(result.total_stock).toEqual(1);
    expect(result.available_stock).toEqual(1);
    expect(result.shelf_location).toEqual('B2-05');
    expect(result.status).toEqual('tersedia');

    // Verify nullable fields are null
    expect(result.isbn).toBeNull();
    expect(result.description).toBeNull();

    expect(result.id).toBeDefined();
    expect(result.created_at).toBeInstanceOf(Date);
    expect(result.updated_at).toBeInstanceOf(Date);
  });

  it('should save book to database correctly', async () => {
    const result = await createBook(testInput);

    // Query the database to verify the book was saved
    const books = await db.select()
      .from(booksTable)
      .where(eq(booksTable.id, result.id))
      .execute();

    expect(books).toHaveLength(1);
    const savedBook = books[0];

    // Verify database record matches returned result
    expect(savedBook.title).toEqual('Test Book Title');
    expect(savedBook.category).toEqual('Fiction');
    expect(savedBook.author).toEqual('Test Author');
    expect(savedBook.publisher).toEqual('Test Publisher');
    expect(savedBook.publication_year).toEqual(2023);
    expect(savedBook.page_count).toEqual(250);
    expect(savedBook.isbn).toEqual('978-0123456789');
    expect(savedBook.total_stock).toEqual(5);
    expect(savedBook.available_stock).toEqual(5);
    expect(savedBook.shelf_location).toEqual('A1-01');
    expect(savedBook.status).toEqual('tersedia');
    expect(savedBook.description).toEqual('A test book for unit testing');
    expect(savedBook.created_at).toBeInstanceOf(Date);
    expect(savedBook.updated_at).toBeInstanceOf(Date);
  });

  it('should set available_stock equal to total_stock for new books', async () => {
    const inputWithLargeStock: CreateBookInput = {
      ...testInput,
      total_stock: 50
    };

    const result = await createBook(inputWithLargeStock);

    expect(result.total_stock).toEqual(50);
    expect(result.available_stock).toEqual(50);

    // Verify in database as well
    const books = await db.select()
      .from(booksTable)
      .where(eq(booksTable.id, result.id))
      .execute();

    expect(books[0].total_stock).toEqual(50);
    expect(books[0].available_stock).toEqual(50);
  });

  it('should create multiple books with unique IDs', async () => {
    const book1 = await createBook(testInput);
    const book2 = await createBook(minimalInput);

    // Verify both books have different IDs
    expect(book1.id).not.toEqual(book2.id);

    // Verify both books exist in database
    const allBooks = await db.select()
      .from(booksTable)
      .execute();

    expect(allBooks).toHaveLength(2);

    const ids = allBooks.map(book => book.id);
    expect(ids).toContain(book1.id);
    expect(ids).toContain(book2.id);
  });

  it('should handle books with same title but different details', async () => {
    const book1: CreateBookInput = {
      ...testInput,
      title: 'Duplicate Title'
    };

    const book2: CreateBookInput = {
      ...testInput,
      title: 'Duplicate Title',
      author: 'Different Author',
      isbn: '978-9876543210'
    };

    const result1 = await createBook(book1);
    const result2 = await createBook(book2);

    // Both should be created successfully
    expect(result1.title).toEqual('Duplicate Title');
    expect(result2.title).toEqual('Duplicate Title');
    expect(result1.author).toEqual('Test Author');
    expect(result2.author).toEqual('Different Author');
    expect(result1.id).not.toEqual(result2.id);
  });
});