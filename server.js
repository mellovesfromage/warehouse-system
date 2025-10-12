const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const sgMail = require('@sendgrid/mail');

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Email helper function
async function sendEmail(to, subject, text, html) {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('SendGrid not configured. Email would have been sent:');
    console.log(`To: ${to}, Subject: ${subject}`);
    return;
  }
  
  try {
    await sgMail.send({
      to: to,
      from: process.env.FROM_EMAIL || 'warehouse@test.sendgrid.net',
      subject: subject,
      text: text,
      html: html
    });
    console.log(`Email sent to ${to}: ${subject}`);
  } catch (error) {
    console.error('Error sending email:', error);
  }
}
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
  { id: 1, username: 'admin', password: 'admin123', name: 'Admin User', role: 'admin', financeAdmin: true, warehouseAccess: 'all' },
  { id: 2, username: 'wh1', password: 'pass123', name: 'Warehouse 1 Manager', role: 'warehouse', warehouseAccess: [1], financeAdmin: false },
  { id: 3, username: 'wh2', password: 'pass123', name: 'Warehouse 2 Manager', role: 'warehouse', warehouseAccess: [2], financeAdmin: false },
  { id: 4, username: 'finance', password: 'pass123', name: 'Finance Admin', role: 'finance', financeAdmin: true, warehouseAccess: 'all' }
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
    res.json({ 
      success: true, 
      user: { 
        id: user.id, 
        name: user.name, 
        role: user.role, 
        financeAdmin: user.financeAdmin,
        warehouseAccess: user.warehouseAccess 
      } 
    });
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

app.post('/api/expenses', async (req, res) => {
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
  
  // Send email to finance admins
  const financeAdmins = users.filter(u => u.financeAdmin);
  for (const admin of financeAdmins) {
    const emailText = `
New expense submitted by ${req.body.requestedBy}

Title: ${req.body.title}
Amount: GHS ${req.body.amount}
Category: ${req.body.category}
Date Incurred: ${req.body.dateIncurred}
Description: ${req.body.description || 'No description'}

Please log in to the warehouse system to review and approve this expense.
    `;
    
    const emailHtml = `
<h2>New Expense Submitted</h2>
<p><strong>${req.body.requestedBy}</strong> has submitted a new expense for approval.</p>
<table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Title:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${req.body.title}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Amount:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">GHS ${req.body.amount}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Category:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${req.body.category}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Date:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${req.body.dateIncurred}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Description:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${req.body.description || 'No description'}</td></tr>
</table>
<p>Please log in to review and approve this expense.</p>
    `;
    
    // In production, you'd use admin.email here
    // For now, replace with your test email
    await sendEmail('melanie.abraham@gmail.com', `New Expense: ${req.body.title}`, emailText, emailHtml);
  }
  
  res.json({ success: true, expense });
});

app.post('/api/expenses/:id/approve', async (req, res) => {
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
    
    // Send email to requester
    const emailText = `
Your expense has been approved!

Title: ${expense.title}
Amount: GHS ${expense.amount}
Approved by: ${req.body.approvedBy}
Approval Date: ${new Date().toLocaleDateString()}

Your expense is now ready for payment processing.
    `;
    
    const emailHtml = `
<h2>Expense Approved ✓</h2>
<p>Your expense <strong>${expense.title}</strong> has been approved by ${req.body.approvedBy}.</p>
<table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Amount:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">GHS ${expense.amount}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Approved by:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${req.body.approvedBy}</td></tr>
</table>
<p>Your expense is now ready for payment processing.</p>
    `;
    
    // Replace with actual user email in production
    await sendEmail('melanie.abraham@gmail.com', `Expense Approved: ${expense.title}`, emailText, emailHtml);
    
    res.json({ success: true, expense });
  } else {
    res.status(404).json({ success: false, message: 'Expense not found' });
  }
});

app.post('/api/expenses/:id/pay', async (req, res) => {
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
    // Send email to requester
        const emailText = `
    Your expense has been paid!

    Title: ${expense.title}
    Amount: GHS ${expense.amount}
    Payment Method: ${req.body.paymentMethod}
    Reference: ${req.body.paymentReference || 'N/A'}
    Processed by: ${req.body.processedBy}

    Your payment has been completed.
        `;
        
        const emailHtml = `
    <h2>Expense Paid ✓</h2>
    <p>Your expense <strong>${expense.title}</strong> has been paid.</p>
    <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
    <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Amount:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">GHS ${expense.amount}</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Payment Method:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${req.body.paymentMethod}</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Reference:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${req.body.paymentReference || 'N/A'}</td></tr>
    <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Processed by:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${req.body.processedBy}</td></tr>
    </table>
    <p>Your payment has been completed.</p>
        `;
        
        await sendEmail('melanie.abraham@gmail.com', `Expense Paid: ${expense.title}`, emailText, emailHtml);

        res.json({ success: true, expense });
    } else {
        res.status(404).json({ success: false, message: 'Expense not found' });
    }
    });
    let invoices = [];
    let customers = [
    { id: 1, name: 'Asaph Agrochemical', phone: '0280414243', email: '', address: 'Kasapin, Ahafo' },
    { id: 2, name: 'Sample Customer', phone: '0241234567', email: 'customer@example.com', address: 'Accra' }
    ];

    // Invoices API
    app.get('/api/invoices', (req, res) => {
  res.json(invoices);
});

app.post('/api/invoices', (req, res) => {
  const invoice = {
    id: Date.now(),
    invoiceNumber: 'INV-' + Date.now(),
    ...req.body,
    issueDate: new Date().toISOString(),
    status: 'unpaid',
    payments: [],
    attachments: []
  };
  
  // Deduct stock from warehouse
  if (req.body.items && req.body.warehouseId) {
    req.body.items.forEach(item => {
      const key = `${req.body.warehouseId}-${item.productId}`;
      stock[key] = (stock[key] || 0) - item.quantity;
    });
    
    // Record movement
    req.body.items.forEach(item => {
      movements.unshift({
        id: Date.now() + Math.random(),
        type: 'sale',
        timestamp: new Date().toISOString(),
        warehouseId: req.body.warehouseId,
        warehouseName: req.body.warehouseName,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        invoiceNumber: invoice.invoiceNumber,
        customer: req.body.customerName,
        user: req.body.createdBy
      });
    });
  }
  
  invoices.unshift(invoice);
  res.json({ success: true, invoice });
});

app.post('/api/invoices/:id/payment', (req, res) => {
  const invoiceId = parseInt(req.params.id);
  const invoice = invoices.find(i => i.id === invoiceId);
  
  if (invoice) {
    const payment = {
      id: Date.now(),
      amount: parseFloat(req.body.amount),
      method: req.body.method,
      date: new Date().toISOString(),
      recordedBy: req.body.recordedBy
    };
    
    if (!invoice.payments) invoice.payments = [];
    invoice.payments.push(payment);
    
    const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
    const balanceDue = invoice.total - totalPaid;
    
    if (balanceDue <= 0) {
      invoice.status = 'paid';
    } else {
      invoice.status = 'partial';
    }
    
    res.json({ success: true, invoice });
  } else {
    res.status(404).json({ success: false, message: 'Invoice not found' });
  }
});

app.get('/api/customers', (req, res) => {
  res.json(customers);
});

app.post('/api/customers', (req, res) => {
  const customer = {
    id: Date.now(),
    ...req.body
  };
  customers.unshift(customer);
  res.json({ success: true, customer });
});
// Users API
app.get('/api/users', (req, res) => {
  const safeUsers = users.map(u => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    financeAdmin: u.financeAdmin,
    warehouseAccess: u.warehouseAccess
  }));
  res.json(safeUsers);
});

app.post('/api/users', (req, res) => {
  const newUser = {
    id: Date.now(),
    username: req.body.username,
    password: req.body.password,
    name: req.body.name,
    role: req.body.role,
    financeAdmin: req.body.financeAdmin || false,
    warehouseAccess: req.body.warehouseAccess
  };
  users.push(newUser);
  res.json({ success: true, user: newUser });
});

app.put('/api/users/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex !== -1) {
    users[userIndex] = {
      ...users[userIndex],
      name: req.body.name,
      role: req.body.role,
      financeAdmin: req.body.financeAdmin,
      warehouseAccess: req.body.warehouseAccess
    };
    res.json({ success: true, user: users[userIndex] });
  } else {
    res.status(404).json({ success: false, message: 'User not found' });
  }
});

app.delete('/api/users/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  users = users.filter(u => u.id !== userId);
  res.json({ success: true });
});
// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT}`);
});