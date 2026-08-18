//! 命令域模块索引。

pub mod default_library;
pub mod evaluator;
pub mod executor;
pub mod library;

pub use default_library::default_library;
pub use evaluator::{CommandEvaluator, Verdict};
pub use executor::{GroupExecutor, GroupRunEvent, RunError, Runner, split_command_line};
pub use library::{CommandDefinition, CommandGroup, CommandLibrary, InputField, LibraryError};
