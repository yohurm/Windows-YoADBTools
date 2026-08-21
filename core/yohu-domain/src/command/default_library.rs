//! 默认命令库（首次启动/损坏重建时写入；纯代码构造，可单测）。

use super::{CommandDefinition, CommandGroup, CommandLibrary, InputField};

/// 产线常用默认命令库（schemaVersion 2）。
pub fn default_library() -> CommandLibrary {
    let g = |id: &str, name: &str, tags: &[&str], commands: Vec<CommandDefinition>| CommandGroup {
        id: id.into(),
        name: name.into(),
        tags: tags.iter().map(|t| t.to_string()).collect(),
        commands,
    };

    let c = |id: &str,
             name: &str,
             template: &str,
             inputs: Vec<InputField>,
             failure: &str,
             success: &str,
             delay_ms: u64,
             abort: bool| CommandDefinition {
        id: id.into(),
        name: name.into(),
        template: template.into(),
        inputs,
        failure_regex: failure.into(),
        success_regex: success.into(),
        delay_ms,
        abort_on_fail: abort,
    };

    CommandLibrary {
        schema_version: CommandLibrary::SCHEMA_VERSION,
        groups: vec![
            g(
                "g-device",
                "设备信息",
                &["产线"],
                vec![
                    c(
                        "c-model",
                        "型号",
                        "shell getprop ro.product.model",
                        vec![],
                        "",
                        "",
                        0,
                        true,
                    ),
                    c(
                        "c-version",
                        "Android 版本",
                        "shell getprop ro.build.version.release",
                        vec![],
                        "",
                        "",
                        0,
                        true,
                    ),
                    c(
                        "c-serial",
                        "设备序列号",
                        "shell getprop ro.serialno",
                        vec![],
                        "",
                        "",
                        0,
                        true,
                    ),
                ],
            ),
            g(
                "g-power",
                "电源",
                &["产线"],
                vec![
                    c(
                        "c-battery",
                        "电池状态",
                        "shell dumpsys battery",
                        vec![],
                        "",
                        "status|level|temperature",
                        0,
                        true,
                    ),
                    c(
                        "c-wake",
                        "点亮屏幕",
                        "shell input keyevent 224",
                        vec![],
                        "",
                        "",
                        500,
                        true,
                    ),
                    c(
                        "c-sleep",
                        "熄灭屏幕",
                        "shell input keyevent 223",
                        vec![],
                        "",
                        "",
                        500,
                        true,
                    ),
                ],
            ),
            g(
                "g-connect",
                "连接性",
                &["调试"],
                vec![
                    c(
                        "c-wifi",
                        "WiFi 状态",
                        "shell dumpsys wifi | grep -E 'Wi-Fi is|mNetworkInfo'",
                        vec![],
                        "",
                        "",
                        0,
                        false,
                    ),
                    c(
                        "c-ping",
                        "网络连通性（主机）",
                        "shell ping -c 3 {0}",
                        vec![InputField {
                            placeholder: "目标地址（如 8.8.8.8）".into(),
                        }],
                        "100% packet loss",
                        "",
                        0,
                        false,
                    ),
                    c(
                        "c-props",
                        "查询属性",
                        "shell getprop {0}",
                        vec![InputField {
                            placeholder: "属性名（如 ro.product.model）".into(),
                        }],
                        "not found",
                        "",
                        0,
                        false,
                    ),
                ],
            ),
        ],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_library_valid() {
        let lib = default_library();
        assert!(lib.validate().is_ok());
        assert_eq!(lib.groups.len(), 3);
        assert_eq!(
            lib.groups.iter().map(|g| g.commands.len()).sum::<usize>(),
            9
        );
    }

    #[test]
    fn placeholder_inputs_match() {
        let lib = default_library();
        let ping = lib
            .groups
            .iter()
            .flat_map(|g| &g.commands)
            .find(|c| c.id == "c-ping")
            .expect("c-ping 存在");
        assert_eq!(ping.inputs.len(), 1);
    }
}
