use std::{fs, io::{Cursor, Read}, path::Path};

use base64::{engine::general_purpose::STANDARD, Engine};
use image::{codecs::jpeg::JpegEncoder, imageops::FilterType, DynamicImage, GenericImageView, ImageDecoder, ImageFormat, ImageReader};
use serde_json::{json, Value};

const MAX_SOURCE_BYTES: u64 = 128 * 1024 * 1024;
const MAX_PIXELS: u64 = 40_000_000;

const IMAGE_INPUTS: &[&str] = &["jpg", "jpeg", "png", "webp", "tif", "tiff", "bmp", "gif", "avif"];
const IMAGE_OUTPUTS: &[&str] = &["jpg", "jpeg", "png", "webp", "tif", "tiff", "bmp", "gif", "avif"];

pub fn capabilities() -> Vec<Value> {
    ["convert", "compress", "resize", "crop", "rotate", "flip", "strip-metadata"]
        .iter()
        .map(|operation| json!({
            "id": format!("image:{operation}"),
            "operation": operation,
            "label": if *operation == "strip-metadata" { "Delete metadata".to_string() } else { format!("{} image", operation.replace('-', " ")) },
            "category": "image",
            "inputs": IMAGE_INPUTS,
            "outputs": IMAGE_OUTPUTS,
            "backend": "rust-image",
            "available": true,
            "batch": true,
            "preservesMetadata": false,
            "options": {},
            "warning": "Local raster processing; 40 megapixel limit. EXIF and other metadata are removed. Animated images use the first frame."
        }))
        .collect()
}

fn format_for_extension(extension: &str) -> Result<ImageFormat, String> {
    match extension.to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => Ok(ImageFormat::Jpeg),
        "png" => Ok(ImageFormat::Png),
        "webp" => Ok(ImageFormat::WebP),
        "tif" | "tiff" => Ok(ImageFormat::Tiff),
        "bmp" => Ok(ImageFormat::Bmp),
        "gif" => Ok(ImageFormat::Gif),
        "avif" => Ok(ImageFormat::Avif),
        _ => Err("Unsupported image format".into()),
    }
}

fn load_image(path: &Path) -> Result<DynamicImage, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_SOURCE_BYTES { return Err("Image exceeds the 128 MiB source limit".into()); }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    fs::File::open(path).map_err(|error| error.to_string())?
        .take(MAX_SOURCE_BYTES + 1).read_to_end(&mut bytes).map_err(|error| error.to_string())?;
    if bytes.len() as u64 > MAX_SOURCE_BYTES { return Err("Image exceeds the 128 MiB source limit".into()); }
    let reader = ImageReader::new(Cursor::new(bytes)).with_guessed_format().map_err(|error| error.to_string())?;
    let format = reader.format().ok_or("Unsupported image signature")?;
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or_default();
    if format_for_extension(extension)? != format { return Err("Image signature does not match its extension".into()); }
    let mut decoder = reader.into_decoder().map_err(|error| error.to_string())?;
    let (width, height) = decoder.dimensions();
    if width == 0 || height == 0 || u64::from(width) * u64::from(height) > MAX_PIXELS { return Err("Image exceeds the 40 megapixel limit".into()); }
    let orientation = decoder.orientation().map_err(|error| error.to_string())?;
    let mut image = DynamicImage::from_decoder(decoder).map_err(|error| error.to_string())?;
    image.apply_orientation(orientation);
    Ok(image)
}

fn number(options: &Value, key: &str, default: u32, min: u32, max: u32) -> Result<u32, String> {
    let value = match options.get(key) {
        None => default,
        Some(Value::Number(value)) => u32::try_from(value.as_u64().ok_or_else(|| format!("Invalid {key}"))?).map_err(|_| format!("Invalid {key}"))?,
        Some(Value::String(value)) => value.parse::<u32>().map_err(|_| format!("Invalid {key}"))?,
        _ => return Err(format!("Invalid {key}")),
    };
    if !(min..=max).contains(&value) { return Err(format!("Invalid {key}")); }
    Ok(value)
}

fn option<'a>(options: &'a Value, key: &str, default: &'a str) -> Result<&'a str, String> {
    match options.get(key) {
        None => Ok(default),
        Some(Value::String(value)) => Ok(value),
        _ => Err(format!("Invalid {key}")),
    }
}

fn transform(mut image: DynamicImage, operation: &str, options: &Value) -> Result<DynamicImage, String> {
    let (width, height) = image.dimensions();
    match operation {
        "convert" | "compress" | "strip-metadata" => {}
        "resize" => {
            let target_width = number(options, "width", width, 1, 16_384)?;
            let target_height = number(options, "height", height, 1, 16_384)?;
            if u64::from(target_width) * u64::from(target_height) > MAX_PIXELS { return Err("Resize exceeds the pixel limit".into()); }
            image = match option(options, "fit", "inside")? {
                "inside" => image.resize(target_width, target_height, FilterType::Lanczos3),
                "cover" => image.resize_to_fill(target_width, target_height, FilterType::Lanczos3),
                "fill" => image.resize_exact(target_width, target_height, FilterType::Lanczos3),
                _ => return Err("Invalid fit".into()),
            };
        }
        "crop" => {
            let x = number(options, "x", 0, 0, width - 1)?;
            let y = number(options, "y", 0, 0, height - 1)?;
            let w = number(options, "width", width - x, 1, width)?;
            let h = number(options, "height", height - y, 1, height)?;
            if x + w > width || y + h > height { return Err("Crop exceeds image bounds".into()); }
            image = image.crop_imm(x, y, w, h);
        }
        "rotate" => {
            image = match number(options, "angle", 90, 0, 270)? {
                0 => image, 90 => image.rotate90(), 180 => image.rotate180(), 270 => image.rotate270(),
                _ => return Err("This raster backend supports quarter-turn rotation only".into()),
            };
        }
        "flip" => {
            image = match option(options, "direction", "horizontal")? {
                "horizontal" => image.fliph(), "vertical" => image.flipv(),
                _ => return Err("Invalid flip direction".into()),
            };
        }
        _ => return Err("Unsupported image operation".into()),
    }
    Ok(image)
}

fn encode(image: &DynamicImage, extension: &str, quality: u8) -> Result<Vec<u8>, String> {
    let format = format_for_extension(extension)?;
    let mut bytes = Vec::new();
    if format == ImageFormat::Jpeg {
        JpegEncoder::new_with_quality(&mut bytes, quality).encode_image(image).map_err(|error| error.to_string())?;
    } else {
        image.write_to(&mut Cursor::new(&mut bytes), format).map_err(|error| error.to_string())?;
    }
    Ok(bytes)
}

pub fn convert_image(input: &Path, operation: &str, extension: &str, options: &Value, quality: u8) -> Result<Vec<u8>, String> {
    if !IMAGE_OUTPUTS.contains(&extension) { return Err("Unsupported image output format".into()); }
    let image = transform(load_image(input)?, operation, options)?;
    encode(&image, extension, quality)
}

pub fn image_preview(input: &Path, operation: &str, options: &Value) -> Result<Value, String> {
    let image = transform(load_image(input)?, operation, options)?.resize(1024, 1024, FilterType::Lanczos3);
    let (width, height) = image.dimensions();
    let bytes = encode(&image, "png", 85)?;
    if bytes.len() > 12 * 1024 * 1024 { return Err("Preview exceeds 12 MiB".into()); }
    Ok(json!({ "url": format!("data:image/png;base64,{}", STANDARD.encode(bytes)), "width": width, "height": height }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_and_rotates_a_local_image_after_signature_check() {
        let path = std::env::temp_dir().join(format!("santara-test-{}.png", uuid::Uuid::new_v4()));
        let source = DynamicImage::new_rgba8(4, 2);
        source.save_with_format(&path, ImageFormat::Png).unwrap();
        let converted = convert_image(&path, "rotate", "png", &json!({ "angle": 90 }), 85).unwrap();
        assert_eq!(image::load_from_memory(&converted).unwrap().dimensions(), (2, 4));
        let wrong_extension = path.with_extension("jpg");
        fs::rename(&path, &wrong_extension).unwrap();
        assert!(convert_image(&wrong_extension, "convert", "png", &json!({}), 85).is_err());
        fs::remove_file(wrong_extension).unwrap();
    }
}
