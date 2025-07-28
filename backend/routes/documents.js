const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/database');
const { authenticateToken, requireRole, requireOwnerOrTenant } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Allow common document formats
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'text/plain'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, Word documents, images, and text files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5000000 // 5MB default
  },
  fileFilter: fileFilter
});

// Get all documents
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { tenant_id, property_id, document_type } = req.query;

    let query = `
      SELECT d.*, 
             CASE WHEN d.tenant_id IS NOT NULL THEN
               (SELECT CONCAT(u.first_name, ' ', u.last_name) FROM tenants t 
                JOIN users u ON t.user_id = u.id WHERE t.id = d.tenant_id)
             END as tenant_name,
             p.name as property_name
      FROM documents d
      LEFT JOIN properties p ON d.property_id = p.id
    `;
    
    const conditions = [];
    const params = [];
    
    if (req.user.role === 'owner') {
      conditions.push(`p.owner_id = $${params.length + 1}`);
      params.push(req.user.id);
    } else if (req.user.role === 'tenant') {
      conditions.push(`d.tenant_id IN (SELECT id FROM tenants WHERE user_id = $${params.length + 1})`);
      params.push(req.user.id);
    }
    
    if (tenant_id) {
      conditions.push(`d.tenant_id = $${params.length + 1}`);
      params.push(tenant_id);
    }
    
    if (property_id) {
      conditions.push(`d.property_id = $${params.length + 1}`);
      params.push(property_id);
    }
    
    if (document_type) {
      conditions.push(`d.document_type = $${params.length + 1}`);
      params.push(document_type);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY d.created_at DESC';

    const result = await pool.query(query, params);

    res.json({ documents: result.rows });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ message: 'Server error fetching documents' });
  }
});

// Upload document
router.post('/upload', authenticateToken, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { tenant_id, property_id, document_type, notes } = req.body;

    // Validate access permissions
    if (req.user.role === 'owner') {
      // Verify property ownership if property_id provided
      if (property_id) {
        const propertyResult = await pool.query(
          'SELECT id FROM properties WHERE id = $1 AND owner_id = $2',
          [property_id, req.user.id]
        );
        if (propertyResult.rows.length === 0) {
          return res.status(403).json({ message: 'Access denied to this property' });
        }
      }
      
      // Verify tenant belongs to owner if tenant_id provided
      if (tenant_id) {
        const tenantResult = await pool.query(`
          SELECT t.id FROM tenants t
          JOIN properties p ON t.property_id = p.id
          WHERE t.id = $1 AND p.owner_id = $2
        `, [tenant_id, req.user.id]);
        
        if (tenantResult.rows.length === 0) {
          return res.status(403).json({ message: 'Access denied to this tenant' });
        }
      }
    } else if (req.user.role === 'tenant') {
      // Tenants can only upload to their own tenancy
      if (tenant_id) {
        const tenantResult = await pool.query(
          'SELECT id FROM tenants WHERE id = $1 AND user_id = $2',
          [tenant_id, req.user.id]
        );
        if (tenantResult.rows.length === 0) {
          return res.status(403).json({ message: 'Access denied' });
        }
      }
    }

    const result = await pool.query(`
      INSERT INTO documents (tenant_id, property_id, document_type, file_name, file_path, file_size, uploaded_by, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      tenant_id || null,
      property_id || null,
      document_type,
      req.file.originalname,
      req.file.path,
      req.file.size,
      req.user.id,
      notes || null
    ]);

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: result.rows[0]
    });
  } catch (error) {
    console.error('Upload document error:', error);
    // Clean up uploaded file if database insert failed
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: 'Server error uploading document' });
  }
});

// Download document
router.get('/:id/download', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    let query = `
      SELECT d.*, p.owner_id FROM documents d
      LEFT JOIN properties p ON d.property_id = p.id
      WHERE d.id = $1
    `;
    
    const params = [id];
    
    // Add access control
    if (req.user.role === 'owner') {
      query += ` AND p.owner_id = $2`;
      params.push(req.user.id);
    } else if (req.user.role === 'tenant') {
      query += ` AND d.tenant_id IN (SELECT id FROM tenants WHERE user_id = $2)`;
      params.push(req.user.id);
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const document = result.rows[0];

    if (!fs.existsSync(document.file_path)) {
      return res.status(404).json({ message: 'File not found on server' });
    }

    res.download(document.file_path, document.file_name);
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ message: 'Server error downloading document' });
  }
});

// Delete document
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    let query = `
      SELECT d.*, p.owner_id FROM documents d
      LEFT JOIN properties p ON d.property_id = p.id
      WHERE d.id = $1
    `;
    
    const params = [id];
    
    // Add access control
    if (req.user.role === 'owner') {
      query += ` AND p.owner_id = $2`;
      params.push(req.user.id);
    } else if (req.user.role === 'tenant') {
      query += ` AND d.tenant_id IN (SELECT id FROM tenants WHERE user_id = $2) AND d.uploaded_by = $2`;
      params.push(req.user.id);
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const document = result.rows[0];

    // Delete from database
    await pool.query('DELETE FROM documents WHERE id = $1', [id]);

    // Delete file from filesystem
    if (fs.existsSync(document.file_path)) {
      fs.unlinkSync(document.file_path);
    }

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ message: 'Server error deleting document' });
  }
});

// Get document types
router.get('/types/list', authenticateToken, async (req, res) => {
  try {
    const documentTypes = [
      'Lease Agreement',
      'Rent Receipt',
      'Property Inspection',
      'Maintenance Request',
      'Insurance Document',
      'Legal Notice',
      'Tenant Application',
      'Background Check',
      'Move-in Checklist',
      'Move-out Checklist',
      'Photo Documentation',
      'Other'
    ];

    res.json({ documentTypes });
  } catch (error) {
    console.error('Get document types error:', error);
    res.status(500).json({ message: 'Server error fetching document types' });
  }
});

module.exports = router;