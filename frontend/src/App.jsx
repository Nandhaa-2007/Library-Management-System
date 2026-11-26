
import { useEffect, useState } from "react";
import "./App.css";

const API = "http://localhost:5000";

function App() {
  const [books, setBooks] = useState([]);
  const [stats, setStats] = useState({});
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [historyBook, setHistoryBook] = useState(null);

  const [form, setForm] = useState({
    title: "", author: "", isbn: "",
    category: "Fiction", totalCopies: 1
  });

  const [editing, setEditing] = useState(null);

  async function request(url, options = {}) {
    const response = await fetch(API + url, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Something went wrong");
    return result.data;
  }

  async function loadBooks() {
    try {
      const params = new URLSearchParams({
        page,
        search,
        ...(category && { category }),
        ...(availableOnly && { availableOnly: "true" })
      });
      const data = await request("/api/books?" + params);
      setBooks(data.books);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function loadStats() {
    try {
      setStats(await request("/api/stats"));
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function refresh() {
    await Promise.all([loadBooks(), loadStats()]);
  }

  useEffect(() => {
    loadBooks();
  }, [page, search, category, availableOnly]);

  useEffect(() => {
    loadStats();
  }, []);

  function updateForm(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function saveBook(e) {
    e.preventDefault();
    try {
      if (!/^\d{10}$|^\d{13}$/.test(form.isbn)) {
        throw new Error("ISBN must contain exactly 10 or 13 digits");
      }

      if (Number(form.totalCopies) < 1 || Number(form.totalCopies) > 20) {
        throw new Error("Total copies must be between 1 and 20");
      }

      if (editing) {
        await request(`/api/books/${editing._id}`, {
          method: "PUT",
          body: JSON.stringify({
            title: form.title,
            author: form.author,
            totalCopies: Number(form.totalCopies)
          })
        });
        setMessage("Book updated successfully");
      } else {
        await request("/api/books", {
          method: "POST",
          body: JSON.stringify({ ...form, totalCopies: Number(form.totalCopies) })
        });
        setMessage("Book added successfully");
      }

      setForm({
        title: "", author: "", isbn: "",
        category: "Fiction", totalCopies: 1
      });
      setEditing(null);
      setPage(1);
      await refresh();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function editBook(book) {
    setEditing(book);
    setForm({
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      category: book.category,
      totalCopies: book.totalCopies
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteBook(book) {
    if (!window.confirm(`Delete "${book.title}"?`)) return;
    try {
      await request(`/api/books/${book._id}`, { method: "DELETE" });
      setMessage("Book deleted successfully");
      await refresh();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function issueBook(book) {
    const memberName = window.prompt("Enter Member Name:");
    if (!memberName) return;
    const memberId = window.prompt("Enter Member ID:");
    if (!memberId) return;

    const issueDate = window.prompt(
      "Enter Issue Date (YYYY-MM-DD):",
      new Date().toLocaleDateString("en-CA")
    );
    if (!issueDate) return;

    try {
      await request(`/api/books/${book._id}/issue`, {
        method: "POST",
        body: JSON.stringify({ memberName, memberId, issueDate })
      });
      setMessage("Book issued successfully");
      await refresh();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function returnBook(loan) {
    if (!window.confirm("Confirm book return?")) return;
    try {
      const data = await request(`/api/loans/${loan._id}/return`, {
        method: "POST"
      });
      setMessage(`Book returned. Fine: ₹${data.fine}`);
      await showHistory(historyBook);
      await refresh();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function showHistory(book) {
    try {
      const data = await request(`/api/books/${book._id}/loans`);
      setHistory(data);
      setHistoryBook(book);
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>📚 Library Manager</h1>
          <p>Library Book Lending Management System</p>
        </div>
      </header>

      <main className="container">
        {message && (
          <div className="message">
            {message}
            <button onClick={() => setMessage("")}>×</button>
          </div>
        )}

        <h2>Dashboard Overview</h2>
        <section className="stats">
          <div className="stat"><span>Total Titles</span><strong>{stats.totalTitles ?? 0}</strong></div>
          <div className="stat"><span>Total Copies</span><strong>{stats.totalCopies ?? 0}</strong></div>
          <div className="stat"><span>Currently Issued</span><strong>{stats.issuedCopies ?? 0}</strong></div>
          <div className="stat"><span>Overdue Loans</span><strong>{stats.overdueLoans ?? 0}</strong></div>
          <div className="stat"><span>Fine Collected</span><strong>₹{stats.totalFine ?? 0}</strong></div>
        </section>

        <section className="panel">
          <h2>{editing ? "Edit Book" : "Add New Book"}</h2>
          <form onSubmit={saveBook} className="book-form">
            <input name="title" placeholder="Book Title" value={form.title} onChange={updateForm} required />
            <input name="author" placeholder="Author" value={form.author} onChange={updateForm} required />
            <input name="isbn" placeholder="ISBN (10 or 13 digits)" value={form.isbn} onChange={updateForm} disabled={!!editing} required />
            <select name="category" value={form.category} onChange={updateForm} disabled={!!editing}>
              {["Fiction", "Science", "History", "Technology", "Biography", "Other"].map(c => <option key={c}>{c}</option>)}
            </select>
            <input name="totalCopies" type="number" min="1" max="20" placeholder="Total Copies" value={form.totalCopies} onChange={updateForm} required />
            <button className="primary">{editing ? "Update Book" : "Add Book"}</button>
            {editing && <button type="button" className="secondary" onClick={() => {
              setEditing(null);
              setForm({ title: "", author: "", isbn: "", category: "Fiction", totalCopies: 1 });
            }}>Cancel</button>}
          </form>
        </section>

        <section className="panel">
          <h2>Book Collection</h2>
          <div className="filters">
            <input placeholder="Search title or author..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
            <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}>
              <option value="">All Categories</option>
              {["Fiction", "Science", "History", "Technology", "Biography", "Other"].map(c => <option key={c}>{c}</option>)}
            </select>
            <label><input type="checkbox" checked={availableOnly} onChange={e => { setAvailableOnly(e.target.checked); setPage(1); }} /> Available only</label>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Book Code</th><th>Title</th><th>Author</th>
                  <th>Category</th><th>Copies</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {books.map(book => (
                  <tr key={book._id}>
                    <td>{book.bookCode}</td>
                    <td>{book.title}</td>
                    <td>{book.author}</td>
                    <td>{book.category}</td>
                    <td className={book.availableCopies === 0 ? "zero" : ""}>
                      {book.availableCopies}/{book.totalCopies}
                    </td>
                    <td className="actions">
                      <button onClick={() => issueBook(book)} disabled={book.availableCopies === 0}>Issue</button>
                      <button onClick={() => editBook(book)}>Edit</button>
                      <button onClick={() => showHistory(book)}>History</button>
                      <button className="danger" onClick={() => deleteBook(book)} disabled={book.availableCopies !== book.totalCopies}>Delete</button>
                    </td>
                  </tr>
                ))}
                {books.length === 0 && <tr><td colSpan="6">No books found.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </section>

        {historyBook && (
          <section className="panel">
            <div className="history-heading">
              <h2>Loan History: {historyBook.title}</h2>
              <button className="secondary" onClick={() => setHistoryBook(null)}>Close</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Member</th><th>Member ID</th><th>Issue Date</th>
                    <th>Due Date</th><th>Return Date</th><th>Fine</th><th>Status</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(loan => (
                    <tr key={loan._id}>
                      <td>{loan.memberName}</td>
                      <td>{loan.memberId}</td>
                      <td>{new Date(loan.issueDate).toLocaleDateString()}</td>
                      <td>{new Date(loan.dueDate).toLocaleDateString()}</td>
                      <td>{loan.returnDate ? new Date(loan.returnDate).toLocaleDateString() : "-"}</td>
                      <td>₹{loan.fine}</td>
                      <td>
                        <span className={loan.returnDate ? "badge returned" : "badge issued"}>
                          {loan.status}
                        </span>
                        {loan.isOverdue && <span className="badge overdue">Overdue</span>}
                      </td>
                      <td>{!loan.returnDate && <button onClick={() => returnBook(loan)}>Return</button>}</td>
                    </tr>
                  ))}
                  {history.length === 0 && <tr><td colSpan="8">No loan history yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
