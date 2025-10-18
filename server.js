const session = require('express-session');
const express = requires('express');
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
  { id: 1, username: 'admin', password: 'admin123', name: 'Admin User', role: 'admin', financeAdmin: true, warehouseAccess: 'all', warehouseManager: null },
  { id: 2, username: 'wh1', password: 'pass123', name: 'Warehouse 1 Manager', role: 'warehouse', warehouseAccess: [1], financeAdmin: false, warehouseManager: 1 },
  { id: 3, username: 'wh2', password: 'pass123', name: 'Warehouse 2 Manager', role: 'warehouse', warehouseAccess: [2], financeAdmin: false, warehouseManager: 2 },
  { id: 4, username: 'finance', password: 'pass123', name: 'Finance Admin', role: 'accountant', financeAdmin: true, warehouseAccess: 'all', warehouseManager: null }
];

const roleTypes = [
  'CEO',
  'COO', 
  'Admin Officer',
  'Driver',
  'Sales Rep',
  'Accountant',
  'Chief Agronomist',
  'Head of Production',
  'Agogo Admin',
  'Head of Admin',
  'Head of Sales',
  'Agogo Production Staff',
  'Admin' // Keep for backwards compatibility
];

let stock = {
  '1-1': 111, '1-2': 109, '2-1': 0, '2-2': 0, '3-1': 0, '3-2': 0,
  '4-1': 2543, '4-2': 20, '5-1': 2580, '5-2': 0, '6-1': 2300, '6-2': 54,
  '7-1': 64, '7-2': 0, '8-1': 2510, '8-2': 0, '9-1': 0, '9-2': 0,
  '10-1': 127, '10-2': 0, '11-1': 1200, '11-2': 42, '12-1': 1886, '12-2': 0,
  '13-1': 408, '13-2': 0, '14-1': 36, '14-2': 19, '15-1': 2136, '15-2': 0,
  '16-1': 1658, '16-2': 8, '17-1': 0, '17-2': 0, '18-1': 0, '18-2': 0
};
let products = [
  { id: 1, name: '1L Bottle', sku: '1L', price: 0 },
  { id: 2, name: '5L Bottle', sku: '5L', price: 0 }
];
let movements = [];
let expenses = [];

let activityLog = [];

// Activity log helper function
function logActivity(userId, userName, action, details) {
  activityLog.unshift({
    id: Date.now(),
    userId,
    userName,
    action,
    details,
    timestamp: new Date().toISOString()
  });
  // Keep only last 1000 entries
  if (activityLog.length > 1000) {
    activityLog = activityLog.slice(0, 1000);
  }
}

// Activity log API
app.get('/api/activity-log', (req, res) => {
  res.json(activityLog);
});

// API Routes
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  
  if (user) {
    req.session.userId = user.id;
    logActivity(user.id, user.name, 'login', 'User logged in');
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
  const { warehouseId, productId, quantity, userId, userName } = req.body;
  const key = `${warehouseId}-${productId}`;
  const oldStock = stock[key] || 0;
  stock[key] = oldStock + quantity;
  
  const product = products.find(p => p.id === productId);
  const warehouse = warehouses.find(w => w.id === warehouseId);
  
  logActivity(
    userId, 
    userName, 
    'stock_update', 
    `Updated ${product?.name || 'Product'} stock at ${warehouse?.name || 'Warehouse'}: ${oldStock} → ${stock[key]} (${quantity >= 0 ? '+' : ''}${quantity})`
  );
  
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
    status: 'pending_admin_review',
    delegatedTo: null,
    delegatedToName: null,
    timeline: [{
      status: 'pending_admin_review',
      timestamp: new Date().toISOString(),
      user: req.body.requestedBy,
      note: `${req.body.requestedBy} submitted an expense request for admin review.`
    }]
  };
  expenses.unshift(expense);
  
  logActivity(
    req.body.requestedById,
    req.body.requestedBy,
    'expense_created',
    `Created expense: ${req.body.title} (GHS ${req.body.amount})`
  );
  
  // Send email to admins
  const admins = users.filter(u => u.role === 'admin');
  for (const admin of admins) {
    const emailText = `
New expense submitted by ${req.body.requestedBy} - awaiting your review

Title: ${req.body.title}
Amount: GHS ${req.body.amount}
Category: ${req.body.category}
Date Incurred: ${req.body.dateIncurred}
Description: ${req.body.description || 'No description'}

Please log in to the warehouse system to review this expense.
    `;
    
    const emailHtml = `
<h2>New Expense Submitted</h2>
<p><strong>${req.body.requestedBy}</strong> has submitted a new expense awaiting your review.</p>
<table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Title:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${req.body.title}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Amount:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">GHS ${req.body.amount}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Category:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${req.body.category}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Date:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${req.body.dateIncurred}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Description:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${req.body.description || 'No description'}</td></tr>
</table>
<p>Please log in to review and approve for payment.</p>
    `;
    
    await sendEmail('melanie.abraham@gmail.com', `New Expense for Review: ${req.body.title}`, emailText, emailHtml);
  }
  
  res.json({ success: true, expense });
});

// Admin approves and delegates to finance person
app.post('/api/expenses/:id/approve', async (req, res) => {
  const expenseId = parseInt(req.params.id);
  const expense = expenses.find(e => e.id === expenseId);
  
  if (expense) {
    expense.status = 'approved_pending_payment';
    expense.approvedBy = req.body.approvedBy;
    expense.approvalDate = new Date().toISOString();
    expense.delegatedTo = req.body.delegatedToId;
    expense.delegatedToName = req.body.delegatedToName;
    expense.timeline.push({
      status: 'approved_pending_payment',
      timestamp: new Date().toISOString(),
      user: req.body.approvedBy,
      note: `${req.body.approvedBy} approved this expense and delegated payment to ${req.body.delegatedToName}.`
    });
    
    logActivity(
      req.body.approvedById,
      req.body.approvedBy,
      'expense_approved',
      `Approved expense: ${expense.title} (GHS ${expense.amount}) - Delegated to ${req.body.delegatedToName}`
    );
    
    // Send email to requester
    const emailText = `
Your expense has been approved!

Title: ${expense.title}
Amount: GHS ${expense.amount}
Approved by: ${req.body.approvedBy}
Delegated to: ${req.body.delegatedToName}

Your expense has been approved and forwarded for payment processing.
    `;
    
    const emailHtml = `
<h2>Expense Approved ✓</h2>
<p>Your expense <strong>${expense.title}</strong> has been approved by ${req.body.approvedBy} and delegated to ${req.body.delegatedToName} for payment.</p>
<table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Amount:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">GHS ${expense.amount}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Approved by:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${req.body.approvedBy}</td></tr>
</table>
<p>Your expense is now being processed for payment.</p>
    `;
    
    await sendEmail('melanie.abraham@gmail.com', `Expense Approved: ${expense.title}`, emailText, emailHtml);
    
    // Send email to delegated finance person
    const financeEmailText = `
You have been assigned an expense to process for payment

Title: ${expense.title}
Amount: GHS ${expense.amount}
Requested by: ${expense.requestedBy}
Approved by: ${req.body.approvedBy}

Please log in to the warehouse system to process this payment.
    `;
    
    const financeEmailHtml = `
<h2>Expense Assigned for Payment</h2>
<p><strong>${req.body.approvedBy}</strong> has assigned you an expense to process.</p>
<table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Title:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${expense.title}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Amount:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">GHS ${expense.amount}</td></tr>
  <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Requested by:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${expense.requestedBy}</td></tr>
</table>
<p>Please log in to process this payment.</p>
    `;
    
    await sendEmail('melanie.abraham@gmail.com', `Expense Assigned: ${expense.title}`, financeEmailText, financeEmailHtml);
    
    res.json({ success: true, expense });
  } else {
    res.status(404).json({ success: false, message: 'Expense not found' });
  }
});

// Admin rejects expense
app.post('/api/expenses/:id/reject', async (req, res) => {
  const expenseId = parseInt(req.params.id);
  const expense = expenses.find(e => e.id === expenseId);
  
  if (expense) {
    expense.status = 'rejected';
    expense.rejectedBy = req.body.rejectedBy;
    expense.rejectionDate = new Date().toISOString();
    expense.rejectionReason = req.body.reason;
    expense.timeline.push({
      status: 'rejected',
      timestamp: new Date().toISOString(),
      user: req.body.rejectedBy,
      note: `${req.body.rejectedBy} rejected this expense. Reason: ${req.body.reason}`
    });
    
    logActivity(
      req.body.rejectedById,
      req.body.rejectedBy,
      'expense_rejected',
      `Rejected expense: ${expense.title} (GHS ${expense.amount})`
    );
    
    // Email requester
    const emailText = `
Your expense has been rejected

Title: ${expense.title}
Amount: GHS ${expense.amount}
Rejected by: ${req.body.rejectedBy}
Reason: ${req.body.reason}

You can edit and resubmit this expense.
    `;
    
    const emailHtml = `
<h2>Expense Rejected</h2>
<p>Your expense <strong>${expense.title}</strong> has been rejected.</p>
<p><strong>Reason:</strong> ${req.body.reason}</p>
<p>You can edit and resubmit this expense.</p>
    `;
    
    await sendEmail('melanie.abraham@gmail.com', `Expense Rejected: ${expense.title}`, emailText, emailHtml);
    
    res.json({ success: true, expense });
  } else {
    res.status(404).json({ success: false, message: 'Expense not found' });
  }
});

// Admin revokes delegation
app.post('/api/expenses/:id/revoke', async (req, res) => {
  const expenseId = parseInt(req.params.id);
  const expense = expenses.find(e => e.id === expenseId);
  
  if (expense) {
    const previousDelegate = expense.delegatedToName;
    expense.status = 'pending_admin_review';
    expense.delegatedTo = null;
    expense.delegatedToName = null;
    expense.timeline.push({
      status: 'delegation_revoked',
      timestamp: new Date().toISOString(),
      user: req.body.revokedBy,
      note: `${req.body.revokedBy} revoked delegation from ${previousDelegate}.`
    });
    
    logActivity(
      req.body.revokedById,
      req.body.revokedBy,
      'expense_delegation_revoked',
      `Revoked delegation for expense: ${expense.title} (was assigned to ${previousDelegate})`
    );
    
    res.json({ success: true, expense });
  } else {
    res.status(404).json({ success: false, message: 'Expense not found' });
  }
});

// Finance person returns to admin
app.post('/api/expenses/:id/return', async (req, res) => {
  const expenseId = parseInt(req.params.id);
  const expense = expenses.find(e => e.id === expenseId);
  
  if (expense) {
    expense.status = 'pending_admin_review';
    expense.delegatedTo = null;
    expense.delegatedToName = null;
    expense.timeline.push({
      status: 'returned_to_admin',
      timestamp: new Date().toISOString(),
      user: req.body.returnedBy,
      note: `${req.body.returnedBy} returned this expense to admin. Reason: ${req.body.reason}`
    });
    
    logActivity(
      req.body.returnedById,
      req.body.returnedBy,
      'expense_returned',
      `Returned expense to admin: ${expense.title} - ${req.body.reason}`
    );
    
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
    
    logActivity(
      req.body.processedById,
      req.body.processedBy,
      'expense_paid',
      `Marked expense as paid: ${expense.title} (GHS ${expense.amount}) via ${req.body.paymentMethod}`
    );
    
    // Email requester and admin
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
    let waybills = [];
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

  const itemsSummary = req.body.items.map(i => `${i.quantity}x ${i.productName}`).join(', ');
  logActivity(
    req.body.createdById,
    req.body.createdBy,
    'invoice_created',
    `Created invoice ${invoice.invoiceNumber} for ${req.body.customerName} (${itemsSummary}) - Total: GHS ${invoice.total}`
  );
  
  invoices.unshift(invoice);
  res.json({ success: true, invoice });
});
// Waybills API
app.get('/api/waybills', (req, res) => {
  res.json(waybills);
});

app.post('/api/waybills', (req, res) => {
  const waybill = {
    id: Date.now(),
    waybillNumber: 'WB-' + Date.now(),
    ...req.body,
    issueDate: new Date().toISOString(),
    status: 'in-transit'
  };
  waybills.unshift(waybill);
  logActivity(
    req.body.issuedById,
    req.body.issuedBy,
    'waybill_created',
    `Created waybill ${waybill.waybillNumber}: ${req.body.quantity}x ${req.body.productName} from ${req.body.fromWarehouseName} to ${req.body.toWarehouseName}`
  );
  res.json({ success: true, waybill });
});

app.post('/api/waybills/:id/receive', (req, res) => {
  const waybillId = parseInt(req.params.id);
  const waybill = waybills.find(w => w.id === waybillId);
  
  if (waybill) {
    waybill.status = 'received';
    waybill.receivedBy = req.body.receivedBy;
    waybill.receivedDate = new Date().toISOString();
    
    // Add stock to destination warehouse
    const key = `${waybill.toWarehouseId}-${waybill.productId}`;
    stock[key] = (stock[key] || 0) + waybill.quantity;
     logActivity(
      req.body.receivedById,
      req.body.receivedBy,
      'waybill_received',
      `Received waybill ${waybill.waybillNumber}: ${waybill.quantity}x ${waybill.productName} at ${waybill.toWarehouseName}`
    );
    
    res.json({ success: true, waybill });
  } else {
    res.status(404).json({ success: false, message: 'Waybill not found' });
  }
});

app.post('/api/waybills/:id/cancel', (req, res) => {
  const waybillId = parseInt(req.params.id);
  const waybill = waybills.find(w => w.id === waybillId);
  
  if (waybill) {
    waybill.status = 'cancelled';
    waybill.cancelledBy = req.body.cancelledBy;
    waybill.cancelledDate = new Date().toISOString();
    
    // Return stock to source warehouse
    const key = `${waybill.fromWarehouseId}-${waybill.productId}`;
    stock[key] = (stock[key] || 0) + waybill.quantity;
    
     logActivity(
      req.body.cancelledById,
      req.body.cancelledBy,
      'waybill_cancelled',
      `Cancelled waybill ${waybill.waybillNumber}: ${waybill.quantity}x ${waybill.productName} returned to ${waybill.fromWarehouseName}`
    );
    res.json({ success: true, waybill });
  } else {
    res.status(404).json({ success: false, message: 'Waybill not found' });
  }
});
// Products API
app.get('/api/products', (req, res) => {
  res.json(products);
});

app.post('/api/products', (req, res) => {
  const newProduct = {
    id: Date.now(),
    name: req.body.name,
    sku: req.body.sku,
    price: parseFloat(req.body.price) || 0
  };
  products.push(newProduct);
   logActivity(
    req.body.createdById,
    req.body.createdByName,
    'product_created',
    `Created new product: ${newProduct.name} (${newProduct.sku}) - Price: GHS ${newProduct.price}`
  );
  res.json({ success: true, product: newProduct });
});

// Add product update endpoint
app.put('/api/products/:id', (req, res) => {
  const productId = parseInt(req.params.id);
  const productIndex = products.findIndex(p => p.id === productId);
  
  if (productIndex !== -1) {
    products[productIndex] = {
      ...products[productIndex],
      name: req.body.name,
      sku: req.body.sku,
      price: parseFloat(req.body.price) || 0
    };
      const changes = [];
    if (oldProduct.name !== req.body.name) changes.push(`name: ${oldProduct.name} → ${req.body.name}`);
    if (oldProduct.price !== req.body.price) changes.push(`price: GHS ${oldProduct.price} → GHS ${req.body.price}`);
    
    logActivity(
      req.body.updatedById,
      req.body.updatedByName,
      'product_updated',
      `Updated product ${req.body.name}: ${changes.join(', ')}`
    );
    res.json({ success: true, product: products[productIndex] });
  } else {
    res.status(404).json({ success: false, message: 'Product not found' });
  }
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
     logActivity(
      req.body.recordedById,
      req.body.recordedBy,
      'payment_recorded',
      `Recorded payment of GHS ${req.body.amount} for invoice ${invoice.invoiceNumber} via ${req.body.method}`
    );
    
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
  logActivity(
    req.body.createdById,
    req.body.createdByName,
    'user_created',
    `Created new user: ${newUser.name} (${newUser.role})`
  );
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
     const changes = [];
    if (oldUser.name !== req.body.name) changes.push(`name: ${oldUser.name} → ${req.body.name}`);
    if (oldUser.role !== req.body.role) changes.push(`role: ${oldUser.role} → ${req.body.role}`);
    if (oldUser.financeAdmin !== req.body.financeAdmin) changes.push(`financeAdmin: ${oldUser.financeAdmin} → ${req.body.financeAdmin}`);
    
    logActivity(
      req.body.updatedById,
      req.body.updatedByName,
      'user_updated',
      `Updated user ${req.body.name}: ${changes.join(', ')}`
    );
    res.json({ success: true, user: users[userIndex] });
  } else {
    res.status(404).json({ success: false, message: 'User not found' });
  }
});

app.delete('/api/users/:id', (req, res) => {
  const userId = parseInt(req.params.id);
  const user = users.find(u => u.id === userId);
  
  if (user) {
    logActivity(
      req.body.deletedById,
      req.body.deletedByName,
      'user_deleted',
      `Deleted user: ${user.name} (${user.role})`
    );
  }
  
  users = users.filter(u => u.id !== userId);
  res.json({ success: true });
});
// Role types API
app.get('/api/roles', (req, res) => {
  res.json(roleTypes);
});

// Warehouse permissions view API
app.get('/api/warehouse-permissions', (req, res) => {
  const permissions = warehouses.map(warehouse => {
    const usersWithAccess = users.filter(u => 
      u.warehouseAccess === 'all' || 
      (Array.isArray(u.warehouseAccess) && u.warehouseAccess.includes(warehouse.id))
    );
    const manager = users.find(u => u.warehouseManager === warehouse.id);
    
    return {
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      userCount: usersWithAccess.length,
      users: usersWithAccess.map(u => ({ id: u.id, name: u.name, role: u.role })),
      manager: manager ? { id: manager.id, name: manager.name } : null
    };
  });
  res.json(permissions);
});

// Add warehouses array
const warehouses = [
  { id: 1, name: 'Agogo', type: 'sub', location: 'Ghana' },
  { id: 2, name: 'Techiman', type: 'sub', location: 'Ghana' },
  { id: 3, name: 'Ashanti', type: 'sub', location: 'Ghana' },
  { id: 4, name: 'Volta', type: 'sub', location: 'Ghana' },
  { id: 5, name: 'Accra', type: 'central', location: 'Ghana' },
  { id: 6, name: 'Bolga', type: 'sub', location: 'Ghana' },
  { id: 7, name: 'Tamale', type: 'sub', location: 'Ghana' },
  { id: 8, name: 'Enchi', type: 'sub', location: 'Ghana' },
  { id: 9, name: 'Inventory Management', type: 'central', location: 'Ghana' },
  { id: 10, name: 'New Abirem and Koforidua', type: 'sub', location: 'Ghana' },
  { id: 11, name: 'Damongo', type: 'sub', location: 'Ghana' },
  { id: 12, name: 'CSIR-IIR East Legon', type: 'sub', location: 'Ghana' },
  { id: 13, name: 'Wa', type: 'sub', location: 'Ghana' },
  { id: 14, name: 'Goaso', type: 'sub', location: 'Ghana' },
  { id: 15, name: 'Ashanti1', type: 'sub', location: 'Ghana' },
  { id: 16, name: 'Sunyani', type: 'sub', location: 'Ghana' },
  { id: 17, name: 'Hohoe', type: 'sub', location: 'Ghana' },
  { id: 18, name: 'Assin Fosu', type: 'sub', location: 'Ghana' }
];

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT}`);
});