
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

// BOOK MODEL
const bookSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  author: { type: String, required: true, trim: true },
  isbn: { type: String, required: true, unique: true },
  category: {
    type: String,
    enum: ["Fiction", "Science", "History", "Technology", "Biography", "Other"],
    required: true
  },
  totalCopies: { type: Number, required: true },
  availableCopies: { type: Number, required: true },
  bookCode: { type: String, required: true, unique: true }
}, { timestamps: true });

const Book = mongoose.model("Book", bookSchema);

// CATEGORY COUNTER MODEL
const counterSchema = new mongoose.Schema({
  category: { type: String, unique: true },
  sequence: { type: Number, default: 0 }
});

const Counter = mongoose.model("Counter", counterSchema);

// LOAN MODEL
const loanSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: "Book", required: true },
  memberName: { type: String, required: true },
  memberId: { type: String, required: true },
  issueDate: { type: Date, required: true },
  dueDate: { type: Date, required: true },
  returnDate: { type: Date, default: null },
  fine: { type: Number, default: 0 }
}, { timestamps: true });

const Loan = mongoose.model("Loan", loanSchema);

const send = (res, status, success, message, data = null) => {
  res.status(status).json({ success, message, data });
};

// HOME
app.get("/", (req, res) => {
  send(res, 200, true, "Library Book Lending Manager API is running");
});

// ADD BOOK
app.post("/api/books", async (req, res) => {
  try {
    const { title, author, isbn, category, totalCopies } = req.body;

    if (!title || !author || !isbn || !category ||
        totalCopies === undefined || totalCopies === null) {
      return send(res, 400, false, "All fields are required");
    }

    if (!/^\d{10}$|^\d{13}$/.test(String(isbn))) {
      return send(res, 400, false, "ISBN must contain exactly 10 or 13 digits");
    }

    if (!Number.isInteger(Number(totalCopies)) ||
        Number(totalCopies) < 1 || Number(totalCopies) > 20) {
      return send(res, 400, false, "Total Copies must be between 1 and 20");
    }

    const categories = ["Fiction", "Science", "History", "Technology", "Biography", "Other"];
    if (!categories.includes(category)) {
      return send(res, 400, false, "Invalid category");
    }

    const existing = await Book.findOne({ isbn: String(isbn) });
    if (existing) return send(res, 409, false, "This ISBN already exists");

    const counter = await Counter.findOneAndUpdate(
      { category },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true }
    );

    const bookCode = `LB-${category.substring(0, 3).toUpperCase()}-${String(counter.sequence).padStart(3, "0")}`;

    const book = await Book.create({
      title, author, isbn: String(isbn), category,
      totalCopies: Number(totalCopies),
      availableCopies: Number(totalCopies),
      bookCode
    });

    send(res, 201, true, "Book added successfully", book);
  } catch (error) {
    if (error.code === 11000) {
      return send(res, 409, false, "Duplicate ISBN or Book Code");
    }
    send(res, 400, false, error.message);
  }
});

// VIEW BOOKS - SEARCH, FILTER AND PAGINATION
app.get("/api/books", async (req, res) => {
  try {
    const { category, availableOnly, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 5;

    const filter = {};

    if (category) filter.category = category;
    if (availableOnly === "true") filter.availableCopies = { $gt: 0 };

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { author: { $regex: search, $options: "i" } }
      ];
    }

    const totalBooks = await Book.countDocuments(filter);
    const books = await Book.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    send(res, 200, true, "Books fetched successfully", {
      books,
      currentPage: page,
      totalPages: Math.ceil(totalBooks / limit),
      totalBooks
    });
  } catch (error) {
    send(res, 400, false, error.message);
  }
});

// VIEW ONE BOOK
app.get("/api/books/:id", async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return send(res, 404, false, "Book not found");
    send(res, 200, true, "Book found", book);
  } catch (error) {
    send(res, 400, false, "Invalid book ID");
  }
});

// EDIT BOOK
app.put("/api/books/:id", async (req, res) => {
  try {
    const { title, author, totalCopies } = req.body;
    const book = await Book.findById(req.params.id);

    if (!book) return send(res, 404, false, "Book not found");

    if (title !== undefined) {
      if (!String(title).trim()) return send(res, 400, false, "Title is required");
      book.title = title;
    }

    if (author !== undefined) {
      if (!String(author).trim()) return send(res, 400, false, "Author is required");
      book.author = author;
    }

    if (totalCopies !== undefined) {
      const newTotal = Number(totalCopies);
      if (!Number.isInteger(newTotal) || newTotal < 1 || newTotal > 20) {
        return send(res, 400, false, "Total Copies must be between 1 and 20");
      }

      const issued = book.totalCopies - book.availableCopies;
      if (newTotal < issued) {
        return send(res, 400, false, "Total Copies cannot be less than issued copies");
      }

      book.totalCopies = newTotal;
      book.availableCopies = newTotal - issued;
    }

    await book.save();
    send(res, 200, true, "Book updated successfully", book);
  } catch (error) {
    send(res, 400, false, error.message);
  }
});

// DELETE BOOK
app.delete("/api/books/:id", async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return send(res, 404, false, "Book not found");

    const activeLoans = await Loan.countDocuments({
      bookId: book._id,
      returnDate: null
    });

    if (activeLoans > 0) {
      return send(res, 409, false, "Cannot delete a book with unreturned copies");
    }

    await Loan.deleteMany({ bookId: book._id });
    await book.deleteOne();

    send(res, 200, true, "Book deleted successfully");
  } catch (error) {
    send(res, 400, false, error.message);
  }
});

// ISSUE BOOK
app.post("/api/books/:id/issue", async (req, res) => {
  try {
    const { memberName, memberId, issueDate } = req.body;

    if (!memberName || !memberId || !issueDate) {
      return send(res, 400, false, "Member Name, Member ID and Issue Date are required");
    }

    const issue = new Date(issueDate);
    if (isNaN(issue.getTime())) {
      return send(res, 400, false, "Invalid Issue Date");
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    if (issue > today) {
      return send(res, 400, false, "Issue Date cannot be in the future");
    }

    const book = await Book.findById(req.params.id);
    if (!book) return send(res, 404, false, "Book not found");

    const duplicate = await Loan.findOne({
      bookId: book._id,
      memberId: String(memberId).trim(),
      returnDate: null
    });

    if (duplicate) {
      return send(res, 409, false, "This member already has this book");
    }

    const updatedBook = await Book.findOneAndUpdate(
      { _id: book._id, availableCopies: { $gt: 0 } },
      { $inc: { availableCopies: -1 } },
      { new: true }
    );

    if (!updatedBook) {
      return send(res, 409, false, "No copies available");
    }

    const dueDate = new Date(issue);
    dueDate.setDate(dueDate.getDate() + 14);

    try {
      const loan = await Loan.create({
        bookId: book._id,
        memberName: String(memberName).trim(),
        memberId: String(memberId).trim(),
        issueDate: issue,
        dueDate
      });

      send(res, 201, true, "Book issued successfully", loan);
    } catch (error) {
      await Book.findByIdAndUpdate(book._id, { $inc: { availableCopies: 1 } });
      throw error;
    }
  } catch (error) {
    send(res, 400, false, error.message);
  }
});

// LOAN HISTORY
app.get("/api/books/:id/loans", async (req, res) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return send(res, 404, false, "Book not found");

    const loans = await Loan.find({ bookId: book._id }).sort({ issueDate: -1 });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const history = loans.map(loan => ({
      ...loan.toObject(),
      status: loan.returnDate ? "Returned" : "Issued",
      isOverdue: !loan.returnDate && loan.dueDate < today
    }));

    send(res, 200, true, "Loan history fetched", history);
  } catch (error) {
    send(res, 400, false, error.message);
  }
});

// RETURN BOOK
app.post("/api/loans/:id/return", async (req, res) => {
  try {
    const loan = await Loan.findById(req.params.id);
    if (!loan) return send(res, 404, false, "Loan not found");

    if (loan.returnDate) {
      return send(res, 409, false, "This book has already been returned");
    }

    const returnDate = new Date();
    const due = new Date(loan.dueDate);
    due.setHours(0, 0, 0, 0);

    const returned = new Date(returnDate);
    returned.setHours(0, 0, 0, 0);

    const lateDays = Math.max(0, Math.floor((returned - due) / 86400000));
    const fine = lateDays * 5;

    loan.returnDate = returnDate;
    loan.fine = fine;
    await loan.save();

    await Book.findByIdAndUpdate(loan.bookId, {
      $inc: { availableCopies: 1 }
    });

    send(res, 200, true, "Book returned successfully", loan);
  } catch (error) {
    send(res, 400, false, error.message);
  }
});

// STATISTICS
app.get("/api/stats", async (req, res) => {
  try {
    const books = await Book.find();
    const loans = await Loan.find();

    const totalTitles = books.length;
    const totalCopies = books.reduce((sum, b) => sum + b.totalCopies, 0);
    const issuedCopies = books.reduce((sum, b) => sum + (b.totalCopies - b.availableCopies), 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueLoans = loans.filter(
      l => !l.returnDate && l.dueDate < today
    ).length;

    const totalFine = loans
      .filter(l => l.returnDate)
      .reduce((sum, l) => sum + l.fine, 0);

    send(res, 200, true, "Statistics fetched", {
      totalTitles,
      totalCopies,
      issuedCopies,
      overdueLoans,
      totalFine
    });
  } catch (error) {
    send(res, 400, false, error.message);
  }
});

// START SERVER
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected successfully");
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch(error => {
    console.log("MongoDB connection error:", error.message);
  });

  