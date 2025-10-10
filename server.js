const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'warehouse-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// In-memory storage (will be replaced with database)
let users = [
  { id: 1, username: 'admin', password: 'admin123', name: 'Admin User', role: 'admin', financeAdmin: true },
  { id: 2, username: 'wh1', password: 'pass123', name: 'Warehouse 1 Manager', role: 'warehouse', warehouseAccess: [1], financeAdmin: false },
  { id: 3, username: 'finance', password: 'pass123', name: 'Finance Admin', role: 'finance', financeAdmin: true }
];

let stock = {
  '1-1': 111, '1-2': 109, '2-1': 0, '2-2': 0, '3-1': 0, '3-2': 0,
  '4-1': 2543, '4-2': 20, '5-1': 2580, '5-2': 0, '6-1': 2300, '6-2': 54,
  '7-1': 64, '7-2': 0, '8-1': 2510, '8-2': 0, '9-1': 0, '9-2': 0,
  '10-1': 127, '10-2': 0, '11-1': 1200, '11-2': 42, '12-1': 1886, '12-2': 0,
  '13-1': 408, '13-2': 0, '14-1': 36, '14-2': 19, '15-1': 2136, '15-2': 0,
  '16-1': 1658, '16-2': 8, '17-1': 0, '17-2': 0, '18-1': 0, '18-2': 0
};

let movements = [];
let expenses = [];

// API Routes
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  
  if (user) {
    req.session.userId = user.id;
    res.json({ success: true, user: { id: user.id, name: user.name, role: user.role, financeAdmin: user.financeAdmin } });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/stock', (req, res) => {
  res.json(stock);
});

app.post('/api/stock/update', (req, res) => {
  const { warehouseId, productId, quantity } = req.body;
  const key = `${warehouseId}-${productId}`;
  stock[key] = (stock[key] || 0) + quantity;
  res.json({ success: true, newStock: stock[key] });
});

app.get('/api/movements', (req, res) => {
  res.json(movements);
});

app.post('/api/movements', (req, res) => {
  const movement = {
    id: Date.now(),
    ...req.body,
    timestamp: new Date().toISOString()
  };
  movements.unshift(movement);
  res.json({ success: true, movement });
});

app.get('/api/expenses', (req, res) => {
  res.json(expenses);
});

app.post('/api/expenses', (req, res) => {
  const expense = {
    id: Date.now(),
    ...req.body,
    submissionDate: new Date().toISOString(),
    status: 'submitted',
    timeline: [{
      status: 'submitted',
      timestamp: new Date().toISOString(),
      user: req.body.requestedBy,
      note: `${req.body.requestedBy} submitted an expense request.`
    }]
  };
  expenses.unshift(expense);
  res.json({ success: true, expense });
});

app.post('/api/expenses/:id/approve', (req, res) => {
  const expenseId = parseInt(req.params.id);
  const expense = expenses.find(e => e.id === expenseId);
  
  if (expense) {
    expense.status = 'approved';
    expense.approvedBy = req.body.approvedBy;
    expense.approvalDate = new Date().toISOString();
    expense.timeline.push({
      status: 'approved',
      timestamp: new Date().toISOString(),
      user: req.body.approvedBy,
      note: `${req.body.approvedBy} approved this expense.`
    });
    res.json({ success: true, expense });
  } else {
    res.status(404).json({ success: false, message: 'Expense not found' });
  }
});

app.post('/api/expenses/:id/pay', (req, res) => {
  const expenseId = parseInt(req.params.id);
  const expense = expenses.find(e => e.id === expenseId);
  
  if (expense) {
    expense.status = 'paid';
    expense.processedBy = req.body.processedBy;
    expense.paymentDate = new Date().toISOString();
    expense.paymentMethod = req.body.paymentMethod;
    expense.paymentReference = req.body.paymentReference;
    expense.timeline.push({
      status: 'paid',
      timestamp: new Date().toISOString(),
      user: req.body.processedBy,
      note: `${req.body.processedBy} processed payment: ${req.body.paymentMethod}`
    });
    res.json({ success: true, expense });
  } else {
    res.status(404).json({ success: false, message: 'Expense not found' });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT}`);
});