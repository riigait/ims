import { Router, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, canAccessDepartment } from '../middleware/auth';
import { csvToJson } from '../utils/csv';
import { buildDepartmentWhereFilter, parsePagination, sendCsv, csvImportRows } from '../utils/routeHelpers';

const router = Router();

const VALID_LOCATION_TYPES = ['branch', 'building', 'floor', 'room', 'rack', 'shelf'] as const;
type LocationType = typeof VALID_LOCATION_TYPES[number];

interface LocationWriteBody {
  name?: string;
  type?: string;
  parentId?: string | null;
  notes?: string | null;
}

function validateLocationWrite(body: LocationWriteBody, isCreate: boolean): string | null {
  if (isCreate && (typeof body.name !== 'string' || !body.name.trim())) return 'Location name is required';
  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 255)) return 'name must be a non-empty string under 255 characters';
  if (isCreate && !body.type) return 'Location type is required';
  if (body.type !== undefined && !(VALID_LOCATION_TYPES as readonly string[]).includes(body.type)) return `type must be one of: ${VALID_LOCATION_TYPES.join(', ')}`;
  if (body.notes !== undefined && body.notes !== null && typeof body.notes !== 'string') return 'notes must be a string';
  if (typeof body.notes === 'string' && body.notes.length > 1000) return 'notes too long';
  return null;
}

// Get all locations
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const search = (req.query.search as string)?.trim();
    const typeFilter = req.query.type as string;
    const whereFilter = buildDepartmentWhereFilter(req, req.query.departmentId as string);
    if (search) whereFilter.name = { contains: search, mode: 'insensitive' };
    if (typeFilter) whereFilter.type = typeFilter;

    const [total, locations] = await Promise.all([
      prisma.location.count({ where: whereFilter }),
      prisma.location.findMany({
        where: whereFilter,
        include: { parent: true, children: true, department: { select: { name: true } }, _count: { select: { products: true, stockDetails: true } } },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
    ]);
    res.json({ data: locations, total, page, limit });
  } catch (error) {
    next(error);
  }
});

// Get location by ID
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const location = await prisma.location.findUnique({
      where: { id: req.params.id },
      include: { parent: true, children: true },
    });

    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    if (!canAccessDepartment(req, location.departmentId, true)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(location);
  } catch (error) {
    next(error);
  }
});

// Create location
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = req.body as LocationWriteBody;
    const validationError = validateLocationWrite(body, true);
    if (validationError) return res.status(400).json({ error: validationError });

    const { name, type, parentId, notes } = body;

    const location = await prisma.location.create({
      data: {
        name: name!,
        type: type! as LocationType,
        parentId: parentId || null,
        departmentId: req.departmentId,
        notes,
      },
    });

    res.status(201).json(location);
  } catch (error) {
    next(error);
  }
});

// Update location
router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.location.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Location not found' });
    if (!canAccessDepartment(req, existing.departmentId, true)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const body = req.body as LocationWriteBody;
    const validationError = validateLocationWrite(body, false);
    if (validationError) return res.status(400).json({ error: validationError });

    const { name, type, parentId, notes } = body;

    const location = await prisma.location.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(type !== undefined && { type: type as LocationType }),
        parentId: parentId || null,
        notes,
      },
    });

    res.json(location);
  } catch (error) {
    next(error);
  }
});

// Delete location (admin only)
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Staff must submit a delete request instead' });
    }

    const existing = await prisma.location.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Location not found' });
    if (!canAccessDepartment(req, existing.departmentId, true)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.location.delete({
      where: { id: req.params.id },
    });
    res.json({ message: 'Location deleted' });
  } catch (error) {
    next(error);
  }
});

// Export locations as CSV
router.get('/export/csv', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const locations = await prisma.location.findMany({
      select: { id: true, name: true, type: true, parentId: true, notes: true, departmentId: true },
    });
    sendCsv(res, locations, 'locations.csv');
  } catch (error) {
    next(error);
  }
});

// Import locations from CSV
router.post('/import/csv', async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.body.csv) return res.status(400).json({ error: 'CSV data required' });
  const rows = csvToJson<any>(req.body.csv);
  await csvImportRows({
    req, res, next, rows,
    buildData: row => ({ name: row.name, type: row.type || 'room', parentId: row.parentId || null, notes: row.notes || null, departmentId: req.departmentId }),
    upsertFn: (id, data) => prisma.location.upsert({ where: { id }, update: data, create: { id, ...data } }),
    createFn: data => prisma.location.create({ data }),
    entityName: 'locations',
  });
});

export default router;
