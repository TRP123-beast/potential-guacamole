#!/usr/bin/env node

import { configDotenv } from "dotenv";
import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

configDotenv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Database helper
function getDatabase() {
  const db = new Database("src/data/data.db");
  try { 
    db.pragma('foreign_keys = OFF'); 
  } catch { 
    db.exec("PRAGMA foreign_keys = OFF"); 
  }
  return db;
}

// ==================== API ROUTES ====================

// GET all bookings
app.get('/api/bookings', (req, res) => {
  const db = getDatabase();
  
  try {
    const { 
      status, 
      limit = 1000, 
      offset = 0,
      search,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;
    
    let query = 'SELECT * FROM bookings WHERE 1=1';
    const params = [];
    
    // Filter by status
    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }
    
    // Search filter
    if (search) {
      query += ' AND (property_address LIKE ? OR listing_id LIKE ? OR user_name LIKE ? OR user_email LIKE ?)';
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }
    
    // Sorting
    const validSortColumns = ['created_at', 'booking_date', 'booking_time', 'status', 'property_address'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    query += ` ORDER BY ${sortColumn} ${order}`;
    
    // Pagination
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const bookings = db.prepare(query).all(...params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM bookings WHERE 1=1';
    const countParams = [];
    
    if (status && status !== 'all') {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    
    if (search) {
      countQuery += ' AND (property_address LIKE ? OR listing_id LIKE ? OR user_name LIKE ? OR user_email LIKE ?)';
      const searchParam = `%${search}%`;
      countParams.push(searchParam, searchParam, searchParam, searchParam);
    }
    
    const { total } = db.prepare(countQuery).get(...countParams);
    
    res.json({
      success: true,
      data: bookings,
      total: total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    db.close();
  }
});

// GET single booking by ID
app.get('/api/bookings/:id', (req, res) => {
  const db = getDatabase();
  
  try {
    const { id } = req.params;
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    res.json({
      success: true,
      data: booking
    });
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    db.close();
  }
});

// GET booking statistics
app.get('/api/stats', (req, res) => {
  const db = getDatabase();
  
  try {
    // Total bookings
    const { total } = db.prepare('SELECT COUNT(*) as total FROM bookings').get();
    
    // Auto-confirmed
    const { autoConfirmed } = db.prepare('SELECT COUNT(*) as autoConfirmed FROM bookings WHERE auto_confirmed = 1').get();
    
    // This week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { thisWeek } = db.prepare('SELECT COUNT(*) as thisWeek FROM bookings WHERE created_at >= ?').get(weekAgo.toISOString());
    
    // Pending
    const { pending } = db.prepare('SELECT COUNT(*) as pending FROM bookings WHERE status = ?').get('Pending');
    
    // Confirmed
    const { confirmed } = db.prepare('SELECT COUNT(*) as confirmed FROM bookings WHERE status = ?').get('Confirmed');
    
    // By status
    const statusCounts = db.prepare(`
      SELECT status, auto_confirmed, COUNT(*) as count 
      FROM bookings 
      GROUP BY status, auto_confirmed
    `).all();
    
    // Recent bookings (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentBookings = db.prepare(`
      SELECT DATE(created_at) as date, COUNT(*) as count 
      FROM bookings 
      WHERE created_at >= ?
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `).all(thirtyDaysAgo.toISOString());
    
    // Top properties
    const topProperties = db.prepare(`
      SELECT property_address, COUNT(*) as booking_count
      FROM bookings
      WHERE property_address IS NOT NULL
      GROUP BY property_address
      ORDER BY booking_count DESC
      LIMIT 10
    `).all();
    
    res.json({
      success: true,
      data: {
        total,
        autoConfirmed,
        thisWeek,
        pending,
        confirmed,
        statusCounts,
        recentBookings,
        topProperties
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    db.close();
  }
});

// DELETE booking by ID
app.delete('/api/bookings/:id', (req, res) => {
  const db = getDatabase();
  
  try {
    const { id } = req.params;
    
    // Check if booking exists
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    // Delete booking
    db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
    
    res.json({
      success: true,
      message: 'Booking deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting booking:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    db.close();
  }
});

// UPDATE booking status
app.patch('/api/bookings/:id', (req, res) => {
  const db = getDatabase();
  
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status || !['Confirmed', 'Pending', 'Cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be Confirmed, Pending, or Cancelled'
      });
    }
    
    // Check if booking exists
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found'
      });
    }
    
    // Update status
    db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, id);
    
    // Get updated booking
    const updatedBooking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    
    res.json({
      success: true,
      data: updatedBooking,
      message: 'Booking updated successfully'
    });
  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    db.close();
  }
});

// GET properties from database
app.get('/api/properties', (req, res) => {
  const db = getDatabase();
  
  try {
    const { search, limit = 20 } = req.query;
    
    // Check if properties table exists
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='properties'
    `).get();
    
    if (!tableExists) {
      return res.json({
        success: true,
        data: [],
        message: 'Properties table not found'
      });
    }
    
    let query = 'SELECT * FROM properties';
    const params = [];
    
    if (search) {
      query += ' WHERE address LIKE ? OR property_id LIKE ?';
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam);
    }
    
    query += ' LIMIT ?';
    params.push(parseInt(limit));
    
    const properties = db.prepare(query).all(...params);
    
    res.json({
      success: true,
      data: properties
    });
  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    db.close();
  }
});

// Export bookings to CSV
app.get('/api/export/csv', (req, res) => {
  const db = getDatabase();
  
  try {
    const bookings = db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all();
    
    // Create CSV
    const headers = [
      'ID', 'Listing ID', 'Property Address', 'Booking Date', 'Booking Time', 
      'Duration', 'User Name', 'User Email', 'Organization', 'Showing Type', 
      'Status', 'Auto Confirmed', 'Created At'
    ];
    
    let csv = headers.join(',') + '\n';
    
    bookings.forEach(booking => {
      const row = [
        booking.id,
        booking.listing_id,
        booking.property_address || '',
        booking.booking_date,
        booking.booking_time,
        booking.duration,
        booking.user_name,
        booking.user_email,
        booking.organization || '',
        booking.showing_type,
        booking.status,
        booking.auto_confirmed ? 'Yes' : 'No',
        booking.created_at
      ];
      
      csv += row.map(cell => `"${cell}"`).join(',') + '\n';
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=bookings.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    db.close();
  }
});

// Export bookings to JSON
app.get('/api/export/json', (req, res) => {
  const db = getDatabase();
  
  try {
    const bookings = db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all();
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=bookings.json');
    res.json({
      success: true,
      exportedAt: new Date().toISOString(),
      count: bookings.length,
      data: bookings
    });
  } catch (error) {
    console.error('Error exporting JSON:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    db.close();
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const db = getDatabase();
  
  try {
    // Test database connection
    db.prepare('SELECT 1').get();
    
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  } finally {
    db.close();
  }
});

// Serve the dashboard HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'booking-dashboard.html'));
});

// Serve dashboard at /dashboard route as well
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'booking-dashboard.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log(`  🚀 Dashboard Server Running`);
  console.log('='.repeat(60));
  console.log(`  📊 Dashboard URL: http://localhost:${PORT}`);
  console.log(`  📊 Direct Access: http://localhost:${PORT}/dashboard`);
  console.log(`  🔌 API Endpoint: http://localhost:${PORT}/api`);
  console.log(`  📁 Database: src/data/data.db`);
  console.log('='.repeat(60));
  console.log('\n  Available API Endpoints:');
  console.log('  GET    /api/bookings          - Get all bookings');
  console.log('  GET    /api/bookings/:id      - Get single booking');
  console.log('  GET    /api/stats             - Get statistics');
  console.log('  GET    /api/properties        - Get properties');
  console.log('  PATCH  /api/bookings/:id      - Update booking');
  console.log('  DELETE /api/bookings/:id      - Delete booking');
  console.log('  GET    /api/export/csv        - Export to CSV');
  console.log('  GET    /api/export/json       - Export to JSON');
  console.log('  GET    /api/health            - Health check');
  console.log('\n  Press Ctrl+C to stop\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down dashboard server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Shutting down dashboard server...');
  process.exit(0);
});

