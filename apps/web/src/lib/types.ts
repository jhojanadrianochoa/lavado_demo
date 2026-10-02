export type Role = 'ADMIN' | 'SUPERVISOR' | 'WORKER';
export type Priority = 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE';
export type TaskStatus = 'PENDIENTE' | 'ASIGNADA' | 'EN_PROCESO' | 'COMPLETADA' | 'CANCELADA';
export type RequirementStatus = 'PENDIENTE' | 'ASIGNADO' | 'EN_PROCESO' | 'COMPLETADO' | 'CANCELADO';
export type IncidentStatus = 'ABIERTA' | 'EN_PROCESO' | 'SOLUCIONADA' | 'CERRADA';
export type PhotoType = 'ANTES' | 'DESPUES' | 'INCIDENCIA' | 'ADICIONAL';
export type MovementType = 'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'LLENADO';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Mini {
  id: number;
  name: string;
  username?: string;
}
export interface PointMini {
  id: number;
  name: string;
  code: string;
}
export interface ProductMini {
  id: number;
  name: string;
  unit: string;
}

export interface Me {
  id: number;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: Role;
  companyId: number;
  company: { name: string };
  points: { point: PointMini }[];
}

export interface User {
  id: number;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: Role;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  points: { point: PointMini }[];
}

export interface Point {
  id: number;
  code: string;
  name: string;
  address: string;
  city: string;
  active: boolean;
  managerId: number | null;
  notes: string | null;
  createdAt: string;
  manager: (Mini & { role: Role }) | null;
  _count?: { users: number; tasks: number; incidents: number };
  products?: { product: { id: number; name: string; unit?: string; currentStock?: number; minStock?: number } }[];
  users?: { user: Mini & { role: Role; active: boolean } }[];
}

export interface Product {
  id: number;
  name: string;
  description: string | null;
  unit: string;
  currentStock: number;
  minStock: number;
  active: boolean;
  createdAt: string;
}

export interface Movement {
  id: number;
  type: MovementType;
  quantity: number;
  balanceAfter: number;
  reason: string | null;
  createdAt: string;
  product: ProductMini;
  user: Mini;
  point: PointMini | null;
}

export interface Requirement {
  id: number;
  pointId: number;
  type: string;
  description: string;
  priority: Priority;
  status: RequirementStatus;
  notes: string | null;
  createdAt: string;
  assignedAt: string | null;
  completedAt: string | null;
  point: PointMini;
  product: ProductMini | null;
  createdBy: Mini;
  assignee: Mini | null;
  tasks: { id: number; status: TaskStatus; assignee: Mini | null }[];
}

export interface PhotoItem {
  id: number;
  type: PhotoType;
  caption: string | null;
  takenAt: string;
  pointId: number;
  taskId: number | null;
  incidentId: number | null;
  fillingId: number | null;
  user?: Mini;
  point?: PointMini;
}

export interface Filling {
  id: number;
  quantity: number;
  unit: string;
  filledAt: string;
  notes: string | null;
  point: PointMini;
  product: ProductMini;
  user: Mini;
  task: { id: number; description: string; status: TaskStatus } | null;
  photos: { id: number; type: PhotoType; takenAt: string }[];
  movement: { id: number; balanceAfter: number } | null;
}

export interface Incident {
  id: number;
  pointId: number;
  taskId: number | null;
  type: string;
  description: string;
  priority: Priority;
  status: IncidentStatus;
  solution: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  point: PointMini;
  task: { id: number; description: string; status: TaskStatus } | null;
  reportedBy: Mini;
  assignee: Mini | null;
  _count?: { photos: number };
  photos?: PhotoItem[];
}

export interface Task {
  id: number;
  pointId: number;
  requirementId: number | null;
  type: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  notes: string | null;
  dueDate: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  point: PointMini & { address?: string; city?: string };
  product: ProductMini | null;
  assignee: Mini | null;
  createdBy: Mini;
  _count?: { fillings: number; photos: number; incidents: number };
}

export interface TaskDetail extends Task {
  requirement: { id: number; type: string; description: string; status: RequirementStatus } | null;
  fillings: (Omit<Filling, 'point' | 'task' | 'movement' | 'product'> & { product: { id: number; name: string } })[];
  photos: PhotoItem[];
  incidents: (Omit<Incident, 'point' | 'task' | 'assignee'> & { reportedBy: Mini })[];
}

export interface NotificationItem {
  id: number;
  type: string;
  title: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface HistoryEntry {
  kind: 'TAREA' | 'REQUERIMIENTO' | 'LLENADO' | 'INCIDENCIA' | 'INVENTARIO' | 'FOTO';
  id: number;
  date: string;
  title: string;
  detail: string;
  status?: string;
  point?: { id: number; name: string } | null;
  user?: { id: number; name: string } | null;
  quantity?: number;
  unit?: string;
  product?: string;
  link?: string;
  photoId?: number;
}

export interface Catalogs {
  taskTypes: string[];
  requirementTypes: string[];
  incidentTypes: string[];
  units: string[];
}

export interface SettingsData {
  companyName: string;
  logoPath: string;
  autoDeductInventory: string;
  dueSoonHours: string;
  requirePhotoOnComplete: string;
  hasLogo: boolean;
}
