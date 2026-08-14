/**
 * 后台任务 store（状态栏展示；core TaskCenter 的事件镜像）。
 */

import { createStore } from "solid-js/store";

import { onTaskSummary } from "@yovo/api";
import type { TaskInfo } from "@yovo/api";

export interface TaskStore {
  tasks: TaskInfo[];
}

export function createTaskStore() {
  const [state, setState] = createStore<TaskStore>({ tasks: [] });

  void onTaskSummary((e) => {
    setState("tasks", e.tasks);
  });

  return { state };
}

export type TaskStoreApi = ReturnType<typeof createTaskStore>;
