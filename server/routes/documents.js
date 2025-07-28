const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/database');
const { requireOwner } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/documents';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, images, Word documents, and text files are allowed.'));
    }
  }
});

// Get all documents with filtering
router.get('/', async (req, res) => {
  try {
    const { 
      leaseId, tenantId, propertyId, documentType, 
      page = 1, limit = 20 
    } = req.query;

    let query;
    let params = [];
    let paramCount = 0;

    if (req.user.role === 'owner') {
      query = `
        SELECT d.*, 
               t.first_name as tenant_first_name, t.last_name as tenant_last_name,
               p.name as property_name, l.start_date, l.end_date,
               u.first_name as uploaded_by_first_name, u.last_name as uploaded_by_last_name
        FROM documents d
        LEFT JOIN tenants t ON d.tenant_id = t.id
        LEFT JOIN properties p ON d.property_id = p.id
        LEFT JOIN leases l ON d.lease_id = l.id
        LEFT JOIN users u ON d.uploaded_by = u.id
        WHERE p.owner_id = $1
      `;
      params.push(req.user.id);
      paramCount = 1;
    } else {
      query = `
        SELECT d.*, 
               p.name as property_name, l.start_date, l.end_date,
               u.first_name as uploaded_by_first_name, u.last_name as uploaded_by_last_name
        FROM documents d
        LEFT JOIN properties p ON d.property_id = p.id
        LEFT JOIN leases l ON d.lease_id = l.id
        LEFT JOIN users u ON d.uploaded_by = u.id
        WHERE d.tenant_id = (SELECT id FROM tenants WHERE user_id = $1)
      `;
      params.push(req.user.id);
      paramCount = 1;
    }

    // Add filters
    if (leaseId) {
      paramCount++;
      query += ` AND d.lease_id = $${paramCount}`;
      params.push(leaseId);
    }

    if (tenantId) {
      paramCount++;
      query += ` AND d.tenant_id = $${paramCount}`;
      params.push(tenantId);
    }

    if (propertyId) {
      paramCount++;
      query += ` AND d.property_id = $${paramCount}`;
      params.push(propertyId);
    }

    if (documentType) {
      paramCount++;
      query += ` AND d.document_type = $${paramCount}`;
      params.push(documentType);
    }

    // Get total count for pagination
    const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) FROM');
    const countResult = await pool.query(countQuery, params);
    const totalCount = parseInt(countResult.rows[0].count);

    // Add pagination and ordering
    query += ` ORDER BY d.created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, (page - 1) * limit);

    const result = await pool.query(query, params);

    res.json({
      documents: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalCount,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Failed to get documents' });
  }
});

// Get single document by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let query;
    let params = [id];

    if (req.user.role === 'owner') {
      query = `
        SELECT d.*, 
               t.first_name as tenant_first_name, t.last_name as tenant_last_name,
               p.name as property_name, l.start_date, l.end_date,
               u.first_name as uploaded_by_first_name, u.last_name as uploaded_by_last_name
        FROM documents d
        LEFT JOIN tenants t ON d.tenant_id = t.id
        LEFT JOIN properties p ON d.property_id = p.id
        LEFT JOIN leases l ON d.lease_id = l.id
        LEFT JOIN users u ON d.uploaded_by = u.id
        WHERE d.id = $1 AND p.owner_id = $2
      `;
      params.push(req.user.id);
    } else {
      query = `
        SELECT d.*, 
               p.name as property_name, l.start_date, l.end_date,
               u.first_name as uploaded_by_first_name, u.last_name as uploaded_by_last_name
        FROM documents d
        LEFT JOIN properties p ON d.property_id = p.id
        LEFT JOIN leases l ON d.lease_id = l.id
        LEFT JOIN users u ON d.uploaded_by = u.id
        WHERE d.id = $1 AND d.tenant_id = (SELECT id FROM tenants WHERE user_id = $2)
      `;
      params.push(req.user.id);
    }

    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({ document: result.rows[0] });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ error: 'Failed to get document' });
  }
});

// Upload new document
router.post('/', upload.single('file'), [
  body('documentType').notEmpty().trim(),
  body('leaseId').optional().isInt({ min: 1 }),
  body('tenantId').optional().isInt({ min: 1 }),
  body('propertyId').optional().isInt({ min: 1 }),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const {
      documentType, leaseId, tenantId, propertyId, notes = ''
    } = req.body;

    // Validate permissions and relationships
    if (req.user.role === 'owner') {
      if (propertyId) {
        const propertyCheck = await pool.query(
          'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
          [propertyId, req.user.id]
        );

        if (propertyCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Property not found' });
        }
      }

      if (leaseId) {
        const leaseCheck = await pool.query(
          `SELECT l.id FROM leases l
           JOIN properties p ON l.property_id = p.id
           WHERE l.id = $1 AND p.owner_id = $2`,
          [leaseId, req.user.id]
        );

        if (leaseCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Lease not found' });
        }
      }
    } else {
      // Tenants can only upload documents for their own leases
      if (leaseId) {
        const leaseCheck = await pool.query(
          `SELECT l.id FROM leases l
           JOIN tenants t ON l.tenant_id = t.id
           WHERE l.id = $1 AND t.user_id = $2`,
          [leaseId, req.user.id]
        );

        if (leaseCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Lease not found' });
        }
      }
    }

    const result = await pool.query(
      `INSERT INTO documents (
        lease_id, tenant_id, property_id, document_type, 
        file_name, file_url, file_size, notes, uploaded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        leaseId, tenantId, propertyId, documentType,
        req.file.originalname, req.file.filename, req.file.size,
        notes, req.user.id
      ]
    );

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: result.rows[0]
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

// Update document
router.put('/:id', [
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { notes } = req.body;

    // Check permissions
    let query;
    let params = [id];

    if (req.user.role === 'owner') {
      query = `
        SELECT d.* FROM documents d
        JOIN properties p ON d.property_id = p.id
        WHERE d.id = $1 AND p.owner_id = $2
      `;
      params.push(req.user.id);
    } else {
      query = `
        SELECT d.* FROM documents d
        WHERE d.id = $1 AND d.tenant_id = (SELECT id FROM tenants WHERE user_id = $2)
      `;
      params.push(req.user.id);
    }

    const documentCheck = await pool.query(query, params);
    
    if (documentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const result = await pool.query(
      `UPDATE documents 
       SET notes = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [notes, id]
    );

    res.json({
      message: 'Document updated successfully',
      document: result.rows[0]
    });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// Delete document
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check permissions
    let query;
    let params = [id];

    if (req.user.role === 'owner') {
      query = `
        SELECT d.* FROM documents d
        JOIN properties p ON d.property_id = p.id
        WHERE d.id = $1 AND p.owner_id = $2
      `;
      params.push(req.user.id);
    } else {
      query = `
        SELECT d.* FROM documents d
        WHERE d.id = $1 AND d.tenant_id = (SELECT id FROM tenants WHERE user_id = $2)
      `;
      params.push(req.user.id);
    }

    const documentCheck = await pool.query(query, params);
    
    if (documentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = documentCheck.rows[0];

    // Delete file from filesystem
    const filePath = path.join('uploads/documents', document.file_url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    await pool.query('DELETE FROM documents WHERE id = $1', [id]);

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Download document
router.get('/:id/download', async (req, res) => {
  try {
    const { id } = req.params;

    // Check permissions
    let query;
    let params = [id];

    if (req.user.role === 'owner') {
      query = `
        SELECT d.* FROM documents d
        JOIN properties p ON d.property_id = p.id
        WHERE d.id = $1 AND p.owner_id = $2
      `;
      params.push(req.user.id);
    } else {
      query = `
        SELECT d.* FROM documents d
        WHERE d.id = $1 AND d.tenant_id = (SELECT id FROM tenants WHERE user_id = $2)
      `;
      params.push(req.user.id);
    }

    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = result.rows[0];
    const filePath = path.join('uploads/documents', document.file_url);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.download(filePath, document.file_name);
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
});

// Get document types
router.get('/types/list', async (req, res) => {
  try {
    let query;
    let params = [];

    if (req.user.role === 'owner') {
      query = `
        SELECT DISTINCT document_type, COUNT(*) as count
        FROM documents d
        JOIN properties p ON d.property_id = p.id
        WHERE p.owner_id = $1
        GROUP BY document_type
        ORDER BY count DESC
      `;
      params.push(req.user.id);
    } else {
      query = `
        SELECT DISTINCT document_type, COUNT(*) as count
        FROM documents d
        WHERE d.tenant_id = (SELECT id FROM tenants WHERE user_id = $1)
        GROUP BY document_type
        ORDER BY count DESC
      `;
      params.push(req.user.id);
    }

    const result = await pool.query(query, params);
    res.json({ documentTypes: result.rows });
  } catch (error) {
    console.error('Get document types error:', error);
    res.status(500).json({ error: 'Failed to get document types' });
  }
});

module.exports = router;