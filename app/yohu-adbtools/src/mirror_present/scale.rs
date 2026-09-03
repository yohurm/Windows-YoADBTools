//! 面板内缩放：可用区 contain + HWND 内整数倍吸附。

/// 在可用区内按画面宽高比 contain，返回贴合盒相对区原点的偏移与尺寸。
/// 公式与 UI `fitContain` 相同（先 min 再 round），无画面尺寸时铺满。
pub fn contain_in_zone(zone_w: u32, zone_h: u32, video_w: u32, video_h: u32) -> (i32, i32, u32, u32) {
    if zone_w == 0 || zone_h == 0 {
        return (0, 0, zone_w, zone_h);
    }
    if video_w == 0 || video_h == 0 {
        return (0, 0, zone_w, zone_h);
    }
    let aspect = video_w as f64 / video_h as f64;
    let width = (zone_w as f64).min(zone_h as f64 * aspect);
    let height = width / aspect;
    let w = width.round().max(1.0) as u32;
    let h = height.round().max(1.0) as u32;
    let w = w.min(zone_w);
    let h = h.min(zone_h);
    let x = (zone_w as i32 - w as i32) / 2;
    let y = (zone_h as i32 - h as i32) / 2;
    (x, y, w, h)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Letterbox {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub nearest: bool,
}

fn integer_fit(src_w: u32, src_h: u32, dst_w: u32, dst_h: u32, scale: f64) -> Option<Letterbox> {
    if scale < 1.0 {
        return None;
    }
    let integer = scale.round();
    if integer < 1.0 || (scale - integer).abs() / integer >= 0.01 {
        return None;
    }
    let width = src_w.saturating_mul(integer as u32);
    let height = src_h.saturating_mul(integer as u32);
    if width == 0 || height == 0 || width > dst_w || height > dst_h {
        return None;
    }
    Some(Letterbox {
        x: ((dst_w as i32) - width as i32) / 2,
        y: ((dst_h as i32) - height as i32) / 2,
        width,
        height,
        nearest: true,
    })
}

/// `src` 画进 `dst`。
///
/// UI 已按设备宽高比 contain 时 HWND 与画面同比例：填满，禁止二次 letterbox。
/// 接近整数倍且结果不超出 dest 时吸附并走最近邻。
pub fn fit_letterbox(src_w: u32, src_h: u32, dst_w: u32, dst_h: u32) -> Letterbox {
    if src_w == 0 || src_h == 0 || dst_w == 0 || dst_h == 0 {
        return Letterbox {
            x: 0,
            y: 0,
            width: dst_w.max(1),
            height: dst_h.max(1),
            nearest: false,
        };
    }
    let sx = dst_w as f64 / src_w as f64;
    let sy = dst_h as f64 / src_h as f64;
    let scale = sx.min(sy);
    if let Some(fit) = integer_fit(src_w, src_h, dst_w, dst_h, scale) {
        return fit;
    }
    let pre_fitted = (sx - sy).abs() <= 0.02 * sx.max(sy);
    if pre_fitted {
        return Letterbox {
            x: 0,
            y: 0,
            width: dst_w,
            height: dst_h,
            nearest: false,
        };
    }
    let width = ((src_w as f64) * scale).round().max(1.0) as u32;
    let height = ((src_h as f64) * scale).round().max(1.0) as u32;
    Letterbox {
        x: ((dst_w as i32) - width as i32) / 2,
        y: ((dst_h as i32) - height as i32) / 2,
        width: width.min(dst_w),
        height: height.min(dst_h),
        nearest: false,
    }
}

pub fn map_client_to_video(
    client_x: i32,
    client_y: i32,
    box_: Letterbox,
    video_w: u32,
    video_h: u32,
) -> Option<(u32, u32)> {
    if box_.width == 0 || box_.height == 0 || video_w == 0 || video_h == 0 {
        return None;
    }
    let x = client_x - box_.x;
    let y = client_y - box_.y;
    if x < 0 || y < 0 || x as u32 >= box_.width || y as u32 >= box_.height {
        return None;
    }
    let vx = (x as u64 * video_w as u64 / box_.width as u64) as u32;
    let vy = (y as u64 * video_h as u64 / box_.height as u64) as u32;
    Some((vx.min(video_w.saturating_sub(1)), vy.min(video_h.saturating_sub(1))))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn integer_scale_snaps() {
        let fit = fit_letterbox(100, 200, 200, 400);
        assert_eq!(
            fit,
            Letterbox {
                x: 0,
                y: 0,
                width: 200,
                height: 400,
                nearest: true
            }
        );
    }

    #[test]
    fn contain_when_not_integer() {
        let fit = fit_letterbox(1080, 1920, 500, 800);
        assert!(!fit.nearest);
        assert!(fit.width <= 500 && fit.height <= 800);
        let ratio = fit.width as f64 / fit.height as f64;
        assert!((ratio - 1080.0 / 1920.0).abs() < 0.02);
    }

    #[test]
    fn integer_scale_does_not_overflow_dest() {
        let fit = fit_letterbox(100, 200, 199, 398);
        assert!(fit.width <= 199 && fit.height <= 398);
        assert!(!fit.nearest);
    }

    #[test]
    fn pre_fitted_hwnd_fills() {
        let fit = fit_letterbox(1088, 2400, 400, 882);
        assert_eq!(
            fit,
            Letterbox {
                x: 0,
                y: 0,
                width: 400,
                height: 882,
                nearest: false
            }
        );
    }

    #[test]
    fn contain_matches_js_portrait() {
        let (x, y, w, h) = contain_in_zone(900, 950, 1088, 2400);
        assert_eq!((x, y, w, h), (234, 0, 431, 950));
    }

    #[test]
    fn contain_fills_when_no_video() {
        assert_eq!(contain_in_zone(800, 600, 0, 0), (0, 0, 800, 600));
    }

    #[test]
    fn maps_inside_letterbox() {
        let box_ = Letterbox {
            x: 10,
            y: 20,
            width: 100,
            height: 200,
            nearest: true,
        };
        assert_eq!(map_client_to_video(10, 20, box_, 50, 100), Some((0, 0)));
        assert_eq!(map_client_to_video(0, 0, box_, 50, 100), None);
    }
}
