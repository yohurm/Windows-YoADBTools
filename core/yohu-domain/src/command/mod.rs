//! 命令域模块索引。

pub mod default_library;
pub mod evaluator;
pub mod executor;
pub mod library;

pub use default_library::default_library;
pub use evaluator::{CommandEvaluator, Verdict};
pub use executor::{
    run_and_evaluate, split_command_line, EvaluatedRun, GroupExecutor, GroupRunEvent, RunError,
    Runner,
};
pub use library::{CommandDefinition, CommandGroup, CommandLibrary, InputField, LibraryError};
