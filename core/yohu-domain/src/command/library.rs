//! 命令库领域模型与校验（schemaVersion 2，全新定义）。
//!
//! wire 结构（DTO）在 yohu-protocol；本模块持有领域语义（校验/占位符规则）。

use serde::{Deserialize, Serialize};
use yohu_protocol::{CommandDto, CommandGroupDto, CommandLibraryDto, InputFieldDto};

/// 占位符输入框提示。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct InputField {
    pub placeholder: String,
}

/// 一条命令。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandDefinition {
    pub id: String,
    pub name: String,
    /// 完整命令行模板（占位符 `{0}` `{1}` …，执行前由 [`CommandDefinition::fill`]）
    pub template: String,
    #[serde(default)]
    pub inputs: Vec<InputField>,
    #[serde(default)]
    pub failure_regex: String,
    #[serde(default)]
    pub success_regex: String,
    /// 组内本命令执行前的延时（毫秒）
    #[serde(default)]
    pub delay_ms: u64,
    #[serde(default = "abort_on_fail_default")]
    pub abort_on_fail: bool,
}

fn abort_on_fail_default() -> bool {
    true
}

/// 命令组（组内顺序执行）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandGroup {
    pub id: String,
    pub name: String,
    /// 分类 = 标签（纯派生）
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub commands: Vec<CommandDefinition>,
}

/// 命令库（`library.json` 全量结构）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CommandLibrary {
    pub schema_version: u32,
    #[serde(default)]
    pub groups: Vec<CommandGroup>,
}

/// 命令库校验/IO 错误。
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum LibraryError {
    #[error("命令 ID 重复: {0}")]
    DuplicateCommandId(String),
    #[error("命令名称为空 (id={0})")]
    EmptyCommandName(String),
    #[error("组 ID 重复: {0}")]
    DuplicateGroupId(String),
    #[error("占位符与输入框数量不一致 (id={id})：模板最大占位符 {max_index} 需要 {expected} 个输入框，实际 {actual}")]
    PlaceholderMismatch {
        id: String,
        max_index: usize,
        expected: usize,
        actual: usize,
    },
    #[error("正则无效 (id={id}): {reason}")]
    InvalidRegex { id: String, reason: String },
    #[error("填充值数量不一致 (id={id})：需要 {expected} 个，实际 {actual}")]
    FillValueMismatch {
        id: String,
        expected: usize,
        actual: usize,
    },
    #[error("命令组含需填值的命令 (group={group_id}, command={command_id})，请逐条执行")]
    GroupNeedsValues {
        group_id: String,
        command_id: String,
    },
    #[error("读取/写入失败: {0}")]
    Io(String),
}

impl CommandLibrary {
    pub const SCHEMA_VERSION: u32 = yohu_protocol::COMMAND_LIBRARY_SCHEMA_VERSION;

    pub fn empty() -> Self {
        Self {
            schema_version: Self::SCHEMA_VERSION,
            groups: Vec::new(),
        }
    }

    /// 全量校验（保存前调用；保存必须全量提交、取消零污染）。
    pub fn validate(&self) -> Result<(), LibraryError> {
        let mut group_ids = std::collections::HashSet::new();
        let mut cmd_ids = std::collections::HashSet::new();
        for g in &self.groups {
            if !group_ids.insert(g.id.as_str()) {
                return Err(LibraryError::DuplicateGroupId(g.id.clone()));
            }
            for c in &g.commands {
                if c.name.trim().is_empty() {
                    return Err(LibraryError::EmptyCommandName(c.id.clone()));
                }
                if !cmd_ids.insert(c.id.as_str()) {
                    return Err(LibraryError::DuplicateCommandId(c.id.clone()));
                }
                Self::validate_command(c)?;
            }
        }
        Ok(())
    }

    fn validate_command(c: &CommandDefinition) -> Result<(), LibraryError> {
        // 占位符 {n} 的最大索引 + 1 必须等于输入框数量
        let mut max_index: Option<usize> = None;
        let mut rest = c.template.as_str();
        while let Some(pos) = rest.find('{') {
            let after = &rest[pos + 1..];
            let Some(end) = after.find('}') else { break };
            if let Ok(n) = after[..end].parse::<usize>() {
                max_index = Some(max_index.map_or(n, |m: usize| m.max(n)));
            }
            rest = &after[end + 1..];
        }
        if let Some(m) = max_index {
            let expected = m + 1;
            if expected != c.inputs.len() {
                return Err(LibraryError::PlaceholderMismatch {
                    id: c.id.clone(),
                    max_index: m,
                    expected,
                    actual: c.inputs.len(),
                });
            }
        }
        for (name, re) in [
            ("失败正则", &c.failure_regex),
            ("成功正则", &c.success_regex),
        ] {
            if !re.is_empty() {
                regex::Regex::new(re).map_err(|e| LibraryError::InvalidRegex {
                    id: c.id.clone(),
                    reason: format!("{name} {re}: {e}"),
                })?;
            }
        }
        Ok(())
    }

    /// 按 id 查找组。
    pub fn group(&self, id: &str) -> Option<&CommandGroup> {
        self.groups.iter().find(|g| g.id == id)
    }

    /// 跨组按命令 id 查找。
    pub fn command(&self, id: &str) -> Option<&CommandDefinition> {
        self.groups
            .iter()
            .flat_map(|g| g.commands.iter())
            .find(|c| c.id == id)
    }

    // ===== DTO 转换（wire 与领域一致，直接克隆） =====

    pub fn from_dto(dto: &CommandLibraryDto) -> Self {
        Self {
            schema_version: dto.schema_version,
            groups: dto.groups.iter().map(group_from_dto).collect(),
        }
    }

    pub fn to_dto(&self) -> CommandLibraryDto {
        CommandLibraryDto {
            schema_version: self.schema_version,
            groups: self.groups.iter().map(group_to_dto).collect(),
        }
    }
}

impl CommandGroup {
    /// 整组执行不能带未填占位符，否则 `{0}` 会原样打到设备上。
    pub fn first_command_needing_values(&self) -> Option<&CommandDefinition> {
        self.commands.iter().find(|c| !c.inputs.is_empty())
    }
}

impl CommandDefinition {
    /// wire → 领域。
    pub fn from_dto(c: &CommandDto) -> Self {
        command_from_dto(c)
    }

    /// 领域 → wire。
    pub fn to_dto(&self) -> CommandDto {
        command_to_dto(self)
    }

    /// 按序替换 `{0}` `{1}` …。值个数必须等于 `inputs.len()`。
    ///
    /// 单趟扫描替换：从原模板逐个识别 `{n}`，插入的值**不再被重扫**。
    /// 因此若值本身含 `{1}` 等占位符样文本，会被当作字面量保留（原实现顺序
    /// `replace` 会把值里的 `{N}` 二次替换，破坏用户输入）。
    pub fn fill(&self, values: &[String]) -> Result<Self, LibraryError> {
        if values.len() != self.inputs.len() {
            return Err(LibraryError::FillValueMismatch {
                id: self.id.clone(),
                expected: self.inputs.len(),
                actual: values.len(),
            });
        }
        let mut out = String::with_capacity(self.template.len());
        let mut rest = self.template.as_str();
        loop {
            let Some(pos) = rest.find('{') else {
                out.push_str(rest);
                break;
            };
            out.push_str(&rest[..pos]);
            let after = &rest[pos + 1..];
            if let Some(end) = after.find('}') {
                if let Ok(n) = after[..end].parse::<usize>() {
                    if let Some(value) = values.get(n) {
                        out.push_str(value);
                        rest = &after[end + 1..];
                        continue;
                    }
                }
            }
            // 不是可识别的占位符（或索引越界，防御）：保留字面 `{`，继续向后扫描
            out.push('{');
            rest = after;
        }
        Ok(Self {
            template: out,
            ..self.clone()
        })
    }
}

fn group_from_dto(g: &CommandGroupDto) -> CommandGroup {
    CommandGroup {
        id: g.id.clone(),
        name: g.name.clone(),
        tags: g.tags.clone(),
        commands: g.commands.iter().map(command_from_dto).collect(),
    }
}

fn group_to_dto(g: &CommandGroup) -> CommandGroupDto {
    CommandGroupDto {
        id: g.id.clone(),
        name: g.name.clone(),
        tags: g.tags.clone(),
        commands: g.commands.iter().map(command_to_dto).collect(),
    }
}

fn command_from_dto(c: &CommandDto) -> CommandDefinition {
    CommandDefinition {
        id: c.id.clone(),
        name: c.name.clone(),
        template: c.template.clone(),
        inputs: c
            .inputs
            .iter()
            .map(|i| InputField {
                placeholder: i.placeholder.clone(),
            })
            .collect(),
        failure_regex: c.failure_regex.clone(),
        success_regex: c.success_regex.clone(),
        delay_ms: c.delay_ms,
        abort_on_fail: c.abort_on_fail,
    }
}

fn command_to_dto(c: &CommandDefinition) -> CommandDto {
    CommandDto {
        id: c.id.clone(),
        name: c.name.clone(),
        template: c.template.clone(),
        inputs: c
            .inputs
            .iter()
            .map(|i| InputFieldDto {
                placeholder: i.placeholder.clone(),
            })
            .collect(),
        failure_regex: c.failure_regex.clone(),
        success_regex: c.success_regex.clone(),
        delay_ms: c.delay_ms,
        abort_on_fail: c.abort_on_fail,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cmd(id: &str, name: &str, template: &str) -> CommandDefinition {
        CommandDefinition {
            id: id.into(),
            name: name.into(),
            template: template.into(),
            inputs: vec![],
            failure_regex: String::new(),
            success_regex: String::new(),
            delay_ms: 0,
            abort_on_fail: true,
        }
    }

    fn group(id: &str, commands: Vec<CommandDefinition>) -> CommandGroup {
        CommandGroup {
            id: id.into(),
            name: format!("组{id}"),
            tags: vec![],
            commands,
        }
    }

    #[test]
    fn empty_library_valid() {
        assert!(CommandLibrary::empty().validate().is_ok());
    }

    #[test]
    fn duplicate_ids_rejected() {
        let lib = CommandLibrary {
            schema_version: CommandLibrary::SCHEMA_VERSION,
            groups: vec![
                group("g1", vec![cmd("c1", "a", "echo 1")]),
                group("g1", vec![cmd("c2", "b", "echo 2")]),
            ],
        };
        assert!(matches!(
            lib.validate(),
            Err(LibraryError::DuplicateGroupId(_))
        ));

        let lib = CommandLibrary {
            schema_version: CommandLibrary::SCHEMA_VERSION,
            groups: vec![group(
                "g1",
                vec![cmd("c1", "a", "echo 1"), cmd("c1", "b", "echo 2")],
            )],
        };
        assert!(matches!(
            lib.validate(),
            Err(LibraryError::DuplicateCommandId(_))
        ));
    }

    #[test]
    fn placeholder_count_mismatch_rejected() {
        let mut c = cmd("c1", "a", "shell getprop {0} {1}");
        c.inputs = vec![InputField {
            placeholder: "key".into(),
        }];
        let lib = CommandLibrary {
            schema_version: CommandLibrary::SCHEMA_VERSION,
            groups: vec![group("g1", vec![c])],
        };
        match lib.validate() {
            Err(LibraryError::PlaceholderMismatch {
                max_index,
                expected,
                actual,
                ..
            }) => {
                assert_eq!((max_index, expected, actual), (1, 2, 1));
            }
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[test]
    fn invalid_regex_rejected() {
        let mut c = cmd("c1", "a", "echo 1");
        c.failure_regex = "([unclosed".into();
        let lib = CommandLibrary {
            schema_version: CommandLibrary::SCHEMA_VERSION,
            groups: vec![group("g1", vec![c])],
        };
        assert!(matches!(
            lib.validate(),
            Err(LibraryError::InvalidRegex { .. })
        ));
    }

    #[test]
    fn dto_roundtrip() {
        let lib = CommandLibrary {
            schema_version: CommandLibrary::SCHEMA_VERSION,
            groups: vec![group(
                "g1",
                vec![CommandDefinition {
                    id: "c1".into(),
                    name: "版本".into(),
                    template: "shell getprop ro.build.version.release".into(),
                    inputs: vec![],
                    failure_regex: "error".into(),
                    success_regex: String::new(),
                    delay_ms: 100,
                    abort_on_fail: true,
                }],
            )],
        };
        let dto = lib.to_dto();
        let back = CommandLibrary::from_dto(&dto);
        assert_eq!(back, lib);
    }

    #[test]
    fn fill_replaces_placeholders_in_order() {
        let mut c = cmd("c1", "ping", "ping -c 3 {0}");
        c.inputs = vec![InputField {
            placeholder: "host".into(),
        }];
        let filled = c.fill(&["8.8.8.8".into()]).unwrap();
        assert_eq!(filled.template, "ping -c 3 8.8.8.8");

        let mut multi = cmd("c2", "x", "{0} {1} {0}");
        multi.inputs = vec![
            InputField {
                placeholder: "a".into(),
            },
            InputField {
                placeholder: "b".into(),
            },
        ];
        assert_eq!(
            multi.fill(&["a".into(), "b".into()]).unwrap().template,
            "a b a"
        );
    }

    #[test]
    fn fill_rejects_arity_mismatch() {
        let mut c = cmd("c1", "ping", "ping {0}");
        c.inputs = vec![InputField {
            placeholder: "host".into(),
        }];
        assert!(matches!(
            c.fill(&[]),
            Err(LibraryError::FillValueMismatch {
                expected: 1,
                actual: 0,
                ..
            })
        ));
    }

    #[test]
    fn fill_preserves_placeholder_like_text_inside_values() {
        // 值若含 `{1}` 样文本，必须按字面量保留，不能被二次替换（回归 F1）。
        let mut c = cmd("c1", "x", "{0}");
        c.inputs = vec![InputField {
            placeholder: "a".into(),
        }];
        assert_eq!(
            c.fill(&["{1} literal".into()]).unwrap().template,
            "{1} literal"
        );

        // 多个占位符，值含其它占位符样文本
        let mut c = cmd("c2", "y", "{0} {1}");
        c.inputs = vec![
            InputField {
                placeholder: "a".into(),
            },
            InputField {
                placeholder: "b".into(),
            },
        ];
        assert_eq!(
            c.fill(&["a{1}b".into(), "c".into()]).unwrap().template,
            "a{1}b c"
        );
    }

    #[test]
    fn command_lookup_crosses_groups() {
        let lib = CommandLibrary {
            schema_version: CommandLibrary::SCHEMA_VERSION,
            groups: vec![group("g1", vec![cmd("c9", "a", "echo 1")])],
        };
        assert_eq!(lib.command("c9").map(|c| c.name.as_str()), Some("a"));
        assert!(lib.command("missing").is_none());
    }

    #[test]
    fn group_with_inputs_cannot_run_as_whole() {
        let mut c = cmd("c1", "ping", "ping {0}");
        c.inputs = vec![InputField {
            placeholder: "host".into(),
        }];
        let g = group("g1", vec![c]);
        assert_eq!(
            g.first_command_needing_values().map(|c| c.id.as_str()),
            Some("c1")
        );
        assert!(group("g2", vec![cmd("c2", "a", "echo 1")])
            .first_command_needing_values()
            .is_none());
    }
}
