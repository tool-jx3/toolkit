//! ntsc-rs（crates/ntscrs，MIT）的對照：32 × 16 的合成圖套上每一組設定，印出 float RGB 的 JSON（vhs-frame-ntsc.test.ts 的基準檔）。
use ntsc_rs::{
    NtscEffect,
    ctx::Context,
    settings::standard::*,
    yiq_fielding::{BlitInfo, DeinterlaceMode, Rgb, YiqView, pixel_bytes_for},
};

const W: usize = 32;
const H: usize = 16;

fn image() -> Vec<f32> {
    let mut v = vec![0f32; W * H * 3];
    for y in 0..H {
        for x in 0..W {
            let o = (y * W + x) * 3;
            // 色條＋上下的明暗＋斜紋
            let band = (x / 4) % 8;
            let (r, g, b) = match band {
                0 => (1.0, 1.0, 1.0),
                1 => (1.0, 1.0, 0.0),
                2 => (0.0, 1.0, 1.0),
                3 => (0.0, 1.0, 0.0),
                4 => (1.0, 0.0, 1.0),
                5 => (1.0, 0.0, 0.0),
                6 => (0.0, 0.0, 1.0),
                _ => (0.1, 0.1, 0.1),
            };
            let fade = 0.25 + 0.75 * (y as f32 / (H - 1) as f32);
            let stripe = if (x + y) % 5 == 0 { 0.15 } else { 0.0 };
            v[o] = r * fade * 0.8 + stripe;
            v[o + 1] = g * fade * 0.8 + stripe;
            v[o + 2] = b * fade * 0.8 + stripe;
        }
    }
    v
}

fn neutral() -> NtscEffect {
    let mut e = NtscEffect::default();
    e.input_luma_filter = LumaLowpass::None;
    e.chroma_lowpass_in = ChromaLowpass::None;
    e.composite_sharpening = 0.0;
    e.composite_noise.enabled = false;
    e.snow_intensity = 0.0;
    e.head_switching.enabled = false;
    e.tracking_noise.enabled = false;
    e.luma_smear = 0.0;
    e.ringing.enabled = false;
    e.luma_noise.enabled = false;
    e.chroma_noise.enabled = false;
    e.chroma_phase_error = 0.0;
    e.chroma_phase_noise_intensity = 0.0;
    e.chroma_delay_horizontal = 0.0;
    e.chroma_delay_vertical = 0;
    e.vhs_settings.enabled = false;
    e.chroma_vert_blend = false;
    e.chroma_lowpass_out = ChromaLowpass::None;
    e
}

fn run(e: &NtscEffect, frame: usize) -> Vec<f32> {
    let ctx = Context::new();
    let mut buf = image();
    e.apply_effect_to_buffer::<Rgb, f32>(&ctx, (W, H), &mut buf, frame, [1.0, 1.0]);
    let _ = (BlitInfo::from_full_frame(W, H, W * pixel_bytes_for::<Rgb, f32>()), DeinterlaceMode::Bob);
    let _ = YiqView::buf_length_for((W, H), e.use_field.to_yiq_field(0));
    buf
}

fn main() {
    let mut cases: Vec<(String, NtscEffect, usize)> = vec![];
    cases.push(("default".into(), NtscEffect::default(), 0));
    cases.push(("default-f3".into(), NtscEffect::default(), 3));
    cases.push(("neutral".into(), neutral(), 0));
    let mut both = neutral(); both.use_field = UseField::Both; cases.push(("neutral-both".into(), both, 1));
    let mut c = neutral(); c.input_luma_filter = LumaLowpass::Notch; cases.push(("luma-notch".into(), c, 0));
    let mut c = neutral(); c.chroma_lowpass_in = ChromaLowpass::Full; cases.push(("chroma-lp-in".into(), c, 0));
    let mut c = neutral(); c.chroma_lowpass_in = ChromaLowpass::Light; c.filter_type = FilterType::ConstantK; cases.push(("chroma-lp-light-k".into(), c, 0));
    let mut c = neutral(); c.composite_sharpening = 1.0; cases.push(("sharpen".into(), c, 0));
    let mut c = neutral(); c.composite_noise.enabled = true; c.composite_noise.settings = FbmNoiseSettings { frequency: 0.5, intensity: 0.05, detail: 3 }; cases.push(("composite-noise".into(), c, 2));
    let mut c = neutral(); c.snow_intensity = 30.0; c.snow_anisotropy = 0.5; cases.push(("snow".into(), c, 1));
    let mut c = neutral(); c.head_switching.enabled = true; cases.push(("head-switching".into(), c, 0));
    let mut c = neutral(); c.head_switching.enabled = true; c.head_switching.settings.mid_line.enabled = false; cases.push(("head-switching-nomid".into(), c, 5));
    let mut c = neutral(); c.tracking_noise.enabled = true; c.tracking_noise.settings.height = 10; cases.push(("tracking".into(), c, 0));
    let mut c = neutral(); c.luma_smear = 0.5; cases.push(("luma-smear".into(), c, 0));
    let mut c = neutral(); c.ringing.enabled = true; cases.push(("ringing".into(), c, 0));
    let mut c = neutral(); c.luma_noise.enabled = true; c.chroma_noise.enabled = true; cases.push(("plane-noise".into(), c, 4));
    let mut c = neutral(); c.chroma_phase_error = 0.2; c.chroma_phase_noise_intensity = 0.3; cases.push(("phase".into(), c, 0));
    let mut c = neutral(); c.chroma_delay_horizontal = 3.5; c.chroma_delay_vertical = 1; cases.push(("delay".into(), c, 0));
    let mut c = neutral(); c.chroma_delay_horizontal = -2.25; c.chroma_delay_vertical = -1; cases.push(("delay-neg".into(), c, 0));
    let mut c = neutral(); c.vhs_settings.enabled = true; c.vhs_settings.settings.chroma_loss = 0.0; c.vhs_settings.settings.edge_wave.enabled = false; c.vhs_settings.settings.sharpen.enabled = false; cases.push(("vhs-lp".into(), c, 0));
    let mut c = neutral(); c.vhs_settings.enabled = true; c.vhs_settings.settings.tape_speed = VHSTapeSpeed::EP; c.vhs_settings.settings.chroma_loss = 0.2; cases.push(("vhs-ep-all".into(), c, 2));
    let mut c = neutral(); c.vhs_settings.enabled = true; c.vhs_settings.settings.tape_speed = VHSTapeSpeed::NONE; c.vhs_settings.settings.edge_wave.settings.intensity = 4.0; cases.push(("edge-wave".into(), c, 7));
    let mut c = neutral(); c.chroma_vert_blend = true; c.chroma_lowpass_out = ChromaLowpass::Full; cases.push(("vert-blend-lp-out".into(), c, 0));
    let mut c = NtscEffect::default(); c.random_seed = 12345; c.vhs_settings.settings.tape_speed = VHSTapeSpeed::SP; c.snow_intensity = 5.0; cases.push(("default-seed-sp".into(), c, 9));

    let mut c = NtscEffect::default(); c.scale.enabled = true; c.scale.settings.horizontal_scale = 0.5; c.scale.settings.vertical_scale = 0.5; c.snow_intensity = 5.0; cases.push(("default-half-scale".into(), c, 2));
    let mut c = NtscEffect::default(); c.scale.enabled = true; c.scale.settings.horizontal_scale = 0.5; c.scale.settings.vertical_scale = 0.5; c.chroma_delay_horizontal = 3.0; c.chroma_delay_vertical = 2; c.vhs_settings.settings.tape_speed = VHSTapeSpeed::EP; cases.push(("half-scale-delay-ep".into(), c, 4));

    let img = image();
    let fmt = |v: &[f32]| v.iter().map(|x| format!("{:.5}", x)).collect::<Vec<_>>().join(",");
    let mut out = String::new();
    out.push_str(&format!("{{\"width\":{},\"height\":{},\"input\":[{}],\"cases\":{{", W, H, fmt(&img)));
    for (k, (name, e, frame)) in cases.iter().enumerate() {
        let res = run(e, *frame);
        if k > 0 { out.push(','); }
        out.push_str(&format!("\"{}\":{{\"frame\":{},\"rgb\":[{}]}}", name, frame, fmt(&res)));
    }
    out.push_str("}}");
    println!("{}", out);
}
