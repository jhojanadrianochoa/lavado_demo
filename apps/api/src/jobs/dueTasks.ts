import { TaskStatus } from '@prisma/client';
import { notifyUsers, pointManagerIds } from '../lib/notifications.js';
import { prisma } from '../lib/prisma.js';
import { getSettings } from '../lib/settings.js';

/** Notifica tareas abiertas cuya fecha límite está próxima (una sola vez por tarea). */
export async function notifyDueTasks() {
  const companies = await prisma.company.findMany({ select: { id: true } });
  for (const company of companies) {
    const settings = await getSettings(company.id);
    const limit = new Date(Date.now() + Number(settings.dueSoonHours) * 3600 * 1000);
    const tasks = await prisma.task.findMany({
      where: {
        point: { companyId: company.id },
        status: { in: [TaskStatus.PENDIENTE, TaskStatus.ASIGNADA, TaskStatus.EN_PROCESO] },
        dueDate: { not: null, lte: limit },
        dueSoonNotifiedAt: null,
      },
      include: { point: { select: { name: true } } },
    });
    for (const task of tasks) {
      const overdue = task.dueDate! < new Date();
      const recipients = task.assigneeId ? [task.assigneeId] : await pointManagerIds(task.pointId);
      await notifyUsers(recipients, {
        type: 'TAREA_POR_VENCER',
        title: overdue ? 'Tarea vencida' : 'Tarea próxima a vencer',
        message: `${task.point.name}: ${task.description} (límite ${task.dueDate!.toLocaleString('es-CO')})`,
        link: `/tareas/${task.id}`,
      });
      await prisma.task.update({ where: { id: task.id }, data: { dueSoonNotifiedAt: new Date() } });
    }
  }
}

export function startJobs() {
  const run = () => notifyDueTasks().catch((err) => console.error('Error en job de vencimientos', err));
  setTimeout(run, 10_000);
  return setInterval(run, 15 * 60 * 1000);
}
