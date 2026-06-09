import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { jsonToCsv } from './csv';
import prisma from './prisma';

export async function requireSuperadmin(req: AuthRequest, res: Response): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (user?.role !== 'superadmin') {
    res.status(403).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export function buildDepartmentWhereFilter(req: AuthRequest, qDepartmentId?: string): any {
  let whereFilter: any = {};
  if (req.departmentIds && req.departmentIds.length > 0) {
    whereFilter = { OR: [{ departmentId: { in: req.departmentIds } }, { departmentId: null }] };
  } else if ((req.userRole === 'staff' || req.userRole === 'admin') && req.departmentId) {
    whereFilter = { departmentId: req.departmentId };
  }
  if (qDepartmentId && !req.departmentId) whereFilter.departmentId = qDepartmentId;
  return whereFilter;
}

export function parsePagination(query: any, defaultLimit = 200, maxLimit = 500) {
  const page = Math.max(1, Number.parseInt(query.page as string) || 1);
  const limit = Math.min(Math.max(1, Number.parseInt(query.limit as string) || defaultLimit), maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

interface CsvImportOptions<T> {
  req: AuthRequest;
  res: Response;
  next: NextFunction;
  rows: any[];
  buildData: (row: any) => any;
  upsertFn: (id: string, data: any) => Promise<T>;
  createFn: (data: any) => Promise<T>;
  entityName: string;
}

export async function csvImportRows<T>(opts: CsvImportOptions<T>) {
  const { res, next, rows, buildData, upsertFn, createFn, entityName } = opts;
  try {
    const created: T[] = [];
    const errors: { row: number; error: string }[] = [];
    for (let i = 0; i < rows.length; i++) {
      try {
        const data = buildData(rows[i]);
        const result = rows[i].id ? await upsertFn(rows[i].id, data) : await createFn(data);
        created.push(result);
      } catch (err: any) {
        errors.push({ row: i + 1, error: err.message });
      }
    }
    const suffix = errors.length > 0 ? ` with ${errors.length} errors` : '';
    res.json({ created: created.length, errors, message: `Imported ${created.length} ${entityName}${suffix}` });
  } catch (error) {
    next(error);
  }
}

export async function listRequests(
  res: Response,
  next: NextFunction,
  model: { count: (args: any) => Promise<number>; findMany: (args: any) => Promise<any[]> },
  where: any,
  include: any,
  query: any,
  defaultLimit = 50,
) {
  try {
    const { page, limit, skip } = parsePagination(query, defaultLimit, 200);
    const [total, data] = await Promise.all([
      model.count({ where }),
      model.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    ]);
    res.json({ data, total, page, limit });
  } catch (error) {
    next(error);
  }
}

export function sendCsv(res: Response, data: any[], filename: string) {
  const csv = jsonToCsv(data);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}
