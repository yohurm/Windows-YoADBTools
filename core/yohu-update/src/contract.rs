//! 更新检查 Provider 契约：平台实现可替换，检查编排不感知 HTTP。

use std::future::Future;

use crate::error::UpdateError;
use crate::platform::PlatformInfo;
use yohu_protocol::RemoteUpdate;

/// 向分发平台查询是否有新版本。
pub trait UpdateCheckProvider {
    fn check(
        &self,
        platform: &PlatformInfo,
    ) -> impl Future<Output = Result<RemoteUpdate, UpdateError>> + Send;
}
