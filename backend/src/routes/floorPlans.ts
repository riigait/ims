import express, { Router, Request, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest, canAccessDepartment } from '../middleware/auth';
import { csvToJson } from '../utils/csv';
import {
  GENERATED_FLOORPLAN_SUFFIXES,
  GENERATED_FLOORPLAN_PREFIX,
  FLOORPLAN_KNOWLEDGE,
  DEFAULT_AUTO_GENERATE_TEMPLATES,
  TEMPLATE_RULES,
  FloorPlanObject,
  getLocationPlanGroup,
  determineTemplateType,
  validateGeneratedFloorPlan,
  buildGeneratedFloorPlan,
  buildKnowledgeTemplateFloorPlan,
} from '../utils/floorPlanGenerator';

const router = Router();

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getDepartmentFilter(req: AuthRequest) {
  if (req.departmentIds && req.departmentIds.length > 0) {
    return {
      OR: [
        { departmentId: { in: req.departmentIds } },
        { departmentId: null }
      ]
    };
  }

  if ((req.userRole === 'staff' || req.userRole === 'admin') && req.departmentId) {
    return { departmentId: req.departmentId };
  }

  return {};
}

function canManageFloorPlan(req: AuthRequest, departmentId: string | null) {
  if (req.userRole === 'superadmin') return true;
  return req.userRole === 'admin' && Boolean(req.departmentId) && departmentId === req.departmentId;
}

// â”€â”€â”€ Routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Get all floor plans
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const departmentFilter = getDepartmentFilter(req);
    const floorPlans = await prisma.floorPlan.findMany({
      where: departmentFilter,
      include: { location: true },
    });

    const parsed = floorPlans.map((plan) => ({
      ...plan,
      objects: JSON.parse(plan.planJson || '[]'),
    }));

    res.json(parsed);
  } catch (error) {
    next(error);
  }
});

// Find the first floor plan containing a linked location
router.get('/by-location/:locationId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const floorPlans = await prisma.floorPlan.findMany({
      where: getDepartmentFilter(req),
      include: { location: true },
    });

    for (const plan of floorPlans) {
      const objects = JSON.parse(plan.planJson || '[]');
      const matchingObject = objects.find((obj: any) => obj.linkedLocationId === req.params.locationId);

      if (matchingObject) {
        return res.json({
          ...plan,
          objects,
          matchingObjectId: matchingObject.id,
        });
      }
    }

    return res.status(404).json({ error: 'Floor plan not found for location' });
  } catch (error) {
    next(error);
  }
});

// Get template room type definitions
router.get('/room-types', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const dbRoomTypes = await prisma.floorPlanRoomType.findMany({ orderBy: { templateType: 'asc' } });

    if (dbRoomTypes.length > 0) {
      return res.json({ roomTypes: dbRoomTypes, source: 'database' });
    }

    // Return hardcoded defaults
    const defaults = Object.entries(TEMPLATE_RULES).flatMap(([templateType, rules]) =>
      rules.requiredRooms.map((name, i) => ({
        id: `${templateType}-${i}`,
        name,
        templateType,
        isRequired: true,
        defaultColor: templateType === 'technical' ? '#bfdbfe' :
                      templateType === 'warehouse' ? '#fde68a' :
                      templateType === 'dormitory' ? '#bfdbfe' : '#dcfce7',
        minWidth: 120,
        minHeight: 80,
        notes: null,
      }))
    );

    res.json({ roomTypes: defaults, source: 'defaults' });
  } catch (error) {
    next(error);
  }
});

// Get template rules
router.get('/rules', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const dbRules = await prisma.floorPlanRule.findMany({ orderBy: { templateType: 'asc' } });

    if (dbRules.length > 0) {
      return res.json({ rules: dbRules, templateRules: TEMPLATE_RULES, source: 'database' });
    }

    res.json({ rules: [], templateRules: TEMPLATE_RULES, source: 'defaults' });
  } catch (error) {
    next(error);
  }
});

// Import floor plans from CSV
router.post('/import/csv', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.body.csv) {
      return res.status(400).json({ error: 'CSV data required' });
    }

    const departmentId = req.departmentId || (req.userRole === 'superadmin' ? req.body.departmentId : undefined);
    if (!departmentId) {
      return res.status(400).json({ error: 'Select a department before importing floor plans' });
    }

    const rows = csvToJson<any>(req.body.csv);
    const created = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        const width = parseInt(row.width, 10);
        const height = parseInt(row.height, 10);

        if (!row.name || !width || !height) {
          throw new Error('name, width, and height are required');
        }

        const data = {
            name: row.name,
            width,
            height,
            locationId: row.locationId || null,
            departmentId,
            planJson: row.planJson || '[]',
          };
        const floorPlan = row.id
          ? await prisma.floorPlan.upsert({
              where: { id: row.id },
              update: data,
              create: { id: row.id, ...data },
            })
          : await prisma.floorPlan.create({ data });
        created.push(floorPlan);
      } catch (err: any) {
        errors.push({ row: i + 1, error: err.message });
      }
    }

    res.json({
      created: created.length,
      errors,
      message: `Imported ${created.length} floor plans${errors.length > 0 ? ` with ${errors.length} errors` : ''}`,
    });
  } catch (error) {
    next(error);
  }
});

// Auto-generate floor plans from the department's current locations
router.post('/auto-generate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.userRole !== 'admin' && req.userRole !== 'superadmin') {
      return res.status(403).json({ error: 'Only admins can generate floor plans' });
    }

    const departmentId = req.departmentId || req.body.departmentId;
    if (!departmentId) {
      return res.status(400).json({ error: 'Select a department before auto-generating floor plans' });
    }
    const requestedCount = Number.parseInt(req.body.count, 10);
    const planCount = Number.isFinite(requestedCount) ? Math.max(1, Math.min(12, requestedCount)) : 3;
    const requestedTemplates: unknown[] = Array.isArray(req.body.templates) ? req.body.templates : [];
    const allowedTemplates = new Set(FLOORPLAN_KNOWLEDGE.imsUseful);
    const selectedTemplates = (requestedTemplates.length > 0 ? requestedTemplates : DEFAULT_AUTO_GENERATE_TEMPLATES)
      .filter((templateName): templateName is string => typeof templateName === 'string' && allowedTemplates.has(templateName));
    const templatesToGenerate: string[] = (selectedTemplates.length > 0 ? selectedTemplates : DEFAULT_AUTO_GENERATE_TEMPLATES).slice(0, planCount);

    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const locations = await prisma.location.findMany({
      where: { departmentId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });

    if (locations.length === 0) {
      return res.status(400).json({ error: 'No locations found for this department' });
    }

    const locationGroups = new Map<string, typeof locations>();
    locations.forEach((location) => {
      const groupName = getLocationPlanGroup(location.name);
      const groupLocations = locationGroups.get(groupName) || [];
      groupLocations.push(location);
      locationGroups.set(groupName, groupLocations);
    });

    const generatedNames = [
      ...Array.from(locationGroups.keys()).slice(0, Math.max(0, planCount - templatesToGenerate.length)).map((groupName) => `${GENERATED_FLOORPLAN_PREFIX}${department.name} - ${groupName}`),
      ...templatesToGenerate.map((templateName) => `${GENERATED_FLOORPLAN_PREFIX}${department.name} - ${templateName}`),
      ...GENERATED_FLOORPLAN_SUFFIXES.map((suffix) => `${department.name} ${suffix}`),
    ];

    await prisma.floorPlan.deleteMany({
      where: {
        departmentId,
        OR: [
          { name: { in: [...new Set(generatedNames)] } },
          { name: { startsWith: `${GENERATED_FLOORPLAN_PREFIX}${department.name} - ` } },
        ],
      },
    });

    const created = [];

    const groupSlots = Math.max(0, planCount - templatesToGenerate.length);
    for (const [groupName, groupLocations] of Array.from(locationGroups.entries()).slice(0, groupSlots)) {
      const name = `${GENERATED_FLOORPLAN_PREFIX}${department.name} - ${groupName}`;
      const objects = buildGeneratedFloorPlan(name, groupLocations);
      const validation = validateGeneratedFloorPlan(objects, 'office');
      const floorPlan = await prisma.floorPlan.create({
        data: {
          name,
          width: 1800,
          height: 1200,
          departmentId,
          generationScore: validation.score,
          planJson: JSON.stringify(objects),
        },
      });
      await prisma.floorPlanGenerationLog.create({
        data: {
          floorPlanId: floorPlan.id,
          templateUsed: groupName,
          score: validation.score,
          validationResult: JSON.stringify(validation),
        },
      });
      created.push({ ...floorPlan, validation });
    }

    for (const templateName of templatesToGenerate) {
      const name = `${GENERATED_FLOORPLAN_PREFIX}${department.name} - ${templateName}`;
      const objects = buildKnowledgeTemplateFloorPlan(templateName, department.name, locations);
      const templateType = determineTemplateType(templateName);
      const validation = validateGeneratedFloorPlan(objects, templateType);
      const floorPlan = await prisma.floorPlan.create({
        data: {
          name,
          width: 1800,
          height: 1200,
          departmentId,
          generationScore: validation.score,
          planJson: JSON.stringify(objects),
        },
      });
      await prisma.floorPlanGenerationLog.create({
        data: {
          floorPlanId: floorPlan.id,
          templateUsed: templateName,
          score: validation.score,
          validationResult: JSON.stringify(validation),
        },
      });
      created.push({ ...floorPlan, validation });
    }

    const avgScore = created.length > 0
      ? Math.round(created.reduce((sum, p) => sum + (p.validation?.score ?? 0), 0) / created.length)
      : 0;

    res.status(201).json({
      created,
      avgScore,
      message: `Generated ${created.length} floor plan${created.length === 1 ? '' : 's'} with ${locations.length} linked locations â€” avg layout score: ${avgScore}%`,
    });
  } catch (error) {
    next(error);
  }
});

// Get floor plan by ID
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const floorPlan = await prisma.floorPlan.findUnique({
      where: { id: req.params.id },
      include: { location: true },
    });

    if (!floorPlan) {
      return res.status(404).json({ error: 'Floor plan not found' });
    }

    if (!canAccessDepartment(req, floorPlan.departmentId, true)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      ...floorPlan,
      objects: JSON.parse(floorPlan.planJson || '[]'),
    });
  } catch (error) {
    next(error);
  }
});

// Create floor plan
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, width, height, scale, objects, locationId, departmentId: requestedDepartmentId } = req.body;

    if (!name || !width || !height) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const departmentId = req.departmentId || (req.userRole === 'superadmin' ? requestedDepartmentId : undefined);
    if (!departmentId) {
      return res.status(400).json({ error: 'Select a department before creating a floor plan' });
    }

    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) {
      return res.status(404).json({ error: 'Department not found' });
    }

    const floorPlan = await prisma.floorPlan.create({
      data: {
        name,
        width,
        height,
        locationId: locationId || null,
        departmentId,
        planJson: JSON.stringify(objects || []),
      },
    });

    res.status(201).json({
      ...floorPlan,
      objects: objects || [],
      scale: scale || { pixelsPerMeter: 50 },
    });
  } catch (error) {
    next(error);
  }
});

// Save user feedback on a floor plan (approve, edited, bad_layout)
router.post('/:id/feedback', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { feedback, rating, correctedData } = req.body;
    if (!feedback) return res.status(400).json({ error: 'feedback is required' });

    const floorPlan = await prisma.floorPlan.findUnique({ where: { id: req.params.id } });
    if (!floorPlan) return res.status(404).json({ error: 'Floor plan not found' });
    if (!canManageFloorPlan(req, floorPlan.departmentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const templateType = determineTemplateType(floorPlan.name);

    await prisma.floorPlanExample.create({
      data: {
        floorPlanId: floorPlan.id,
        templateType,
        originalData: floorPlan.planJson,
        correctedData: correctedData || null,
        feedback,
        rating: rating ?? null,
        approvedByUserId: (req as any).userId || null,
      },
    });

    if (feedback === 'approved') {
      await prisma.floorPlan.update({
        where: { id: req.params.id },
        data: { isApproved: true },
      });
    }

    await prisma.floorPlanGenerationLog.updateMany({
      where: { floorPlanId: req.params.id },
      data: { userFeedback: feedback },
    });

    res.json({ message: 'Feedback saved', isApproved: feedback === 'approved' });
  } catch (error) {
    next(error);
  }
});

// Regenerate a single auto-generated floor plan
router.post('/:id/regenerate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.userRole !== 'admin' && req.userRole !== 'superadmin') {
      return res.status(403).json({ error: 'Only admins can regenerate floor plans' });
    }

    const floorPlan = await prisma.floorPlan.findUnique({ where: { id: req.params.id } });
    if (!floorPlan) return res.status(404).json({ error: 'Floor plan not found' });
    if (!canManageFloorPlan(req, floorPlan.departmentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const departmentId = floorPlan.departmentId;
    if (!departmentId) return res.status(400).json({ error: 'Floor plan has no department' });

    // Extract template from plan name: "Auto - DeptName - TemplateName"
    const prefix = GENERATED_FLOORPLAN_PREFIX;
    let templateName = floorPlan.name;
    if (floorPlan.name.startsWith(prefix)) {
      const suffix = floorPlan.name.slice(prefix.length);
      const knownTemplate = FLOORPLAN_KNOWLEDGE.imsUseful.find((template) => suffix.endsWith(` - ${template}`));
      templateName = knownTemplate || suffix.split(' - ').pop() || suffix;
    }

    if (!templateName) {
      return res.status(400).json({ error: 'Cannot determine template from plan name â€” only auto-generated plans can be regenerated' });
    }

    const department = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!department) return res.status(404).json({ error: 'Department not found' });

    const locations = await prisma.location.findMany({
      where: { departmentId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });

    if (locations.length === 0) return res.status(400).json({ error: 'No locations found for department' });

    const isKnownTemplate = FLOORPLAN_KNOWLEDGE.imsUseful.includes(templateName);
    const objects = isKnownTemplate
      ? buildKnowledgeTemplateFloorPlan(templateName, department.name, locations)
      : buildGeneratedFloorPlan(floorPlan.name, locations);

    const templateType = determineTemplateType(templateName);
    const validation = validateGeneratedFloorPlan(objects, templateType);

    const updated = await prisma.floorPlan.update({
      where: { id: req.params.id },
      data: {
        planJson: JSON.stringify(objects),
        generationScore: validation.score,
        isApproved: false,
      },
    });

    await prisma.floorPlanGenerationLog.create({
      data: {
        floorPlanId: updated.id,
        templateUsed: templateName,
        score: validation.score,
        validationResult: JSON.stringify(validation),
      },
    });

    res.json({
      ...updated,
      objects,
      validation,
      message: `Regenerated â€” layout score: ${validation.score}%`,
    });
  } catch (error) {
    next(error);
  }
});

// Update floor plan
router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.floorPlan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Floor plan not found' });
    if (!canManageFloorPlan(req, existing.departmentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, width, height, scale, objects, locationId, isTemplate, isApproved } = req.body;

    const floorPlan = await prisma.floorPlan.update({
      where: { id: req.params.id },
      data: {
        name,
        width,
        height,
        locationId: locationId || null,
        planJson: JSON.stringify(objects || []),
        ...(isTemplate !== undefined && { isTemplate }),
        ...(isApproved !== undefined && { isApproved }),
      },
    });

    res.json({
      ...floorPlan,
      objects: objects || [],
      scale: scale || { pixelsPerMeter: 50 },
    });
  } catch (error) {
    next(error);
  }
});

// Delete floor plan (admin or superadmin)
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const existing = await prisma.floorPlan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Floor plan not found' });
    if (!canManageFloorPlan(req, existing.departmentId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.floorPlan.delete({
      where: { id: req.params.id },
    });
    res.json({ message: 'Floor plan deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
