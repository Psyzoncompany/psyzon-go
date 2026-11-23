import type { Task } from "./task-model";

export function splitTask(value: string) {
  const match = /^([^:\n]{1,60}):\s+(.+)$/u.exec(value);
  return match ? { topic: match[1].trim(), title: match[2].trim() } : { topic: "", title: value };
}

export function groupTasks(items: Task[], customerNames: Map<string, string>) {
  const topics = new Map<string, Task[]>();
  for (const task of items) {
    const topic = splitTask(task.title).topic || (task.customerId && customerNames.get(task.customerId)) || "Geral";
    const group = topics.get(topic);
    if (group) group.push(task);
    else topics.set(topic, [task]);
  }
  return [...topics].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
}
