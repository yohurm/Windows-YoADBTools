/**
 * 命令管理编辑器的草稿模型 + 纯转换（DTO ↔ 草稿）。
 * View 只消费本模块；提交前转换、校验在 core（commands/log 校验库）。
 */

import { COMMAND_LIBRARY_SCHEMA_VERSION, type CommandLibraryDto } from "@yohu/api";

/** 编辑器使用的草稿命令（inputs 以文本行编辑，提交时拆分）。 */
export interface DraftCommand {
  id: string;
  name: string;
  template: string;
  inputsText: string;
  failure_regex: string;
  success_regex: string;
  delay_ms: number;
  abort_on_fail: boolean;
}

export interface DraftGroup {
  id: string;
  name: string;
  tagsText: string;
  commands: DraftCommand[];
}

export interface DraftState {
  groups: DraftGroup[];
}

export const emptyCommand = (id: string): DraftCommand => ({
  id,
  name: "",
  template: "",
  inputsText: "",
  failure_regex: "",
  success_regex: "",
  delay_ms: 0,
  abort_on_fail: true,
});

export const emptyGroup = (id: string): DraftGroup => ({ id, name: "", tagsText: "", commands: [] });

let draftId = 0;
export const nextDraftId = (prefix: string): string => `${prefix}-draft-${++draftId}`;

/** 命令库 DTO → 编辑器草稿。 */
export function toDraft(library: CommandLibraryDto): DraftState {
  return {
    groups: library.groups.map((g) => ({
      id: g.id,
      name: g.name,
      tagsText: g.tags.join(", "),
      commands: g.commands.map((c) => ({
        id: c.id,
        name: c.name,
        template: c.template,
        inputsText: c.inputs.map((i) => i.placeholder).join("\n"),
        failure_regex: c.failure_regex,
        success_regex: c.success_regex,
        delay_ms: c.delay_ms,
        abort_on_fail: c.abort_on_fail,
      })),
    })),
  };
}

/** 编辑器草稿 → 命令库 DTO（提交前转换；校验在 core）。 */
export function fromDraft(draft: DraftState): CommandLibraryDto {
  return {
    schema_version: COMMAND_LIBRARY_SCHEMA_VERSION,
    groups: draft.groups.map((g) => ({
      id: g.id,
      name: g.name,
      tags: g.tagsText.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
      commands: g.commands.map((c) => ({
        id: c.id,
        name: c.name,
        template: c.template,
        inputs: c.inputsText
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .map((placeholder) => ({ placeholder })),
        failure_regex: c.failure_regex,
        success_regex: c.success_regex,
        delay_ms: c.delay_ms,
        abort_on_fail: c.abort_on_fail,
      })),
    })),
  };
}
