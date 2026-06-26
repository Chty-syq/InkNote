use image::{
    imageops::FilterType, DynamicImage, ImageFormat, ImageReader, Limits, Rgba, RgbaImage,
};
use reqwest::{
    header::{CONTENT_LENGTH, CONTENT_TYPE, LOCATION},
    redirect::Policy,
    Client,
};
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fs,
    io::Cursor,
    net::{IpAddr, Ipv4Addr, Ipv6Addr, ToSocketAddrs},
    path::{Path, PathBuf},
    time::Duration,
};
use url::Url;

const PAGE_BODY_LIMIT: usize = 2 * 1024 * 1024;
const MANIFEST_BODY_LIMIT: usize = 512 * 1024;
const ICON_BODY_LIMIT: usize = 2 * 1024 * 1024;
const EXTERNAL_IMAGE_BODY_LIMIT: usize = 25 * 1024 * 1024;
const MAX_REDIRECTS: usize = 5;
const ICON_SIZE: u32 = 64;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendLinkIconResult {
    pub icon_path: String,
    pub source_url: String,
    pub resolved_page_url: String,
}

#[derive(Clone)]
struct IconCandidate {
    url: Url,
    score: i32,
}

struct FetchedResource {
    final_url: Url,
    content_type: String,
    body: Vec<u8>,
}

#[derive(Deserialize)]
struct WebManifest {
    #[serde(default)]
    icons: Vec<ManifestIcon>,
}

#[derive(Deserialize)]
struct ManifestIcon {
    src: String,
    #[serde(default)]
    sizes: String,
    #[serde(default, rename = "type")]
    media_type: String,
    #[serde(default)]
    purpose: String,
}

#[tauri::command]
pub async fn cache_external_image(image_url: String) -> Result<FriendLinkIconResult, String> {
    fetch_and_cache(format!("inknote-image:{image_url}")).await
}

pub async fn fetch_and_cache(page_url: String) -> Result<FriendLinkIconResult, String> {
    let (direct_image_mode, requested_url) = page_url
        .strip_prefix("inknote-image:")
        .map(|value| (true, value.to_string()))
        .unwrap_or_else(|| (false, page_url.clone()));
    let initial_url = normalize_http_url(&requested_url)?;
    let client = Client::builder()
        .redirect(Policy::none())
        .timeout(Duration::from_secs(if direct_image_mode { 30 } else { 10 }))
        .user_agent(if direct_image_mode {
            "InkNote-Image-Resolver/1.0"
        } else {
            "InkNote-Favicon-Resolver/1.0"
        })
        .build()
        .map_err(|error| format!("failed to create HTTP client: {error}"))?;

    let page = fetch_limited(
        &client,
        initial_url,
        if direct_image_mode {
            EXTERNAL_IMAGE_BODY_LIMIT
        } else {
            PAGE_BODY_LIMIT
        },
    )
    .await?;
    if direct_image_mode {
        let extension = detect_external_image_extension(&page)?;
        let image_path = store_external_image(&requested_url, extension, &page.body)?;
        return Ok(FriendLinkIconResult {
            icon_path: image_path,
            source_url: page.final_url.to_string(),
            resolved_page_url: page.final_url.to_string(),
        });
    }

    if let Ok(extension) = detect_external_image_extension(&page) {
        let image_path = store_external_image(&requested_url, extension, &page.body)?;
        return Ok(FriendLinkIconResult {
            icon_path: image_path,
            source_url: page.final_url.to_string(),
            resolved_page_url: page.final_url.to_string(),
        });
    }

    let html = String::from_utf8_lossy(&page.body);
    let (mut candidates, manifest_urls) = discover_html_candidates(&html, &page.final_url)?;

    for manifest_url in manifest_urls.into_iter().take(2) {
        if let Ok(mut manifest_candidates) =
            discover_manifest_candidates(&client, manifest_url).await
        {
            candidates.append(&mut manifest_candidates);
        }
    }

    add_standard_fallbacks(&mut candidates, &page.final_url);
    let candidates = rank_and_deduplicate(candidates);
    if candidates.is_empty() {
        return Err("the target page does not expose any usable icon candidates".to_string());
    }

    let mut failures = Vec::new();
    for candidate in candidates.into_iter().take(16) {
        match fetch_limited(&client, candidate.url.clone(), ICON_BODY_LIMIT).await {
            Ok(resource) => match normalize_icon_to_png(&resource) {
                Ok(png) => {
                    let icon_path = cache_icon(&page.final_url, &png)?;
                    return Ok(FriendLinkIconResult {
                        icon_path,
                        source_url: resource.final_url.to_string(),
                        resolved_page_url: page.final_url.to_string(),
                    });
                }
                Err(error) => failures.push(format!("{}: {error}", candidate.url)),
            },
            Err(error) => failures.push(format!("{}: {error}", candidate.url)),
        }
    }

    let detail = failures.into_iter().take(3).collect::<Vec<_>>().join("; ");
    Err(if detail.is_empty() {
        "no usable favicon was found".to_string()
    } else {
        format!("no usable favicon was found ({detail})")
    })
}

fn detect_external_image_extension(resource: &FetchedResource) -> Result<&'static str, String> {
    if resource.content_type == "image/svg+xml" || looks_like_svg(&resource.body) {
        let options = resvg::usvg::Options::default();
        resvg::usvg::Tree::from_data(&resource.body, &options)
            .map_err(|error| format!("invalid SVG image: {error}"))?;
        return Ok("svg");
    }

    match image::guess_format(&resource.body)
        .map_err(|error| format!("unsupported or invalid image: {error}"))?
    {
        ImageFormat::Png => Ok("png"),
        ImageFormat::Jpeg => Ok("jpg"),
        ImageFormat::Gif => Ok("gif"),
        ImageFormat::WebP => Ok("webp"),
        _ => Err("the downloaded resource is not a supported web image".to_string()),
    }
}

fn normalize_http_url(value: &str) -> Result<Url, String> {
    let value = value.trim();
    if value.is_empty() {
        return Err("a friend-link URL is required".to_string());
    }

    let normalized = if value.starts_with("http://") || value.starts_with("https://") {
        value.to_string()
    } else {
        format!("https://{value}")
    };
    let url =
        Url::parse(&normalized).map_err(|error| format!("invalid friend-link URL: {error}"))?;
    validate_public_url(&url)?;
    Ok(url)
}

async fn fetch_limited(
    client: &Client,
    start_url: Url,
    limit: usize,
) -> Result<FetchedResource, String> {
    let mut current_url = start_url;

    for redirect_count in 0..=MAX_REDIRECTS {
        validate_public_url(&current_url)?;
        let mut response = client
            .get(current_url.clone())
            .send()
            .await
            .map_err(|error| format!("request failed for {current_url}: {error}"))?;

        if response.status().is_redirection() {
            if redirect_count == MAX_REDIRECTS {
                return Err("too many redirects".to_string());
            }

            let location = response
                .headers()
                .get(LOCATION)
                .ok_or_else(|| format!("redirect from {current_url} has no Location header"))?
                .to_str()
                .map_err(|_| "redirect Location is not valid UTF-8".to_string())?;
            current_url = current_url
                .join(location)
                .map_err(|error| format!("invalid redirect target: {error}"))?;
            continue;
        }

        if !response.status().is_success() {
            return Err(format!("HTTP {}", response.status()));
        }

        if let Some(length) = response
            .headers()
            .get(CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<usize>().ok())
        {
            if length > limit {
                return Err(format!("response is larger than {} KiB", limit / 1024));
            }
        }

        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .split(';')
            .next()
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase();
        let final_url = response.url().clone();
        let mut body = Vec::new();

        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("failed to read response from {final_url}: {error}"))?
        {
            if body.len() + chunk.len() > limit {
                return Err(format!("response is larger than {} KiB", limit / 1024));
            }
            body.extend_from_slice(&chunk);
        }

        return Ok(FetchedResource {
            final_url,
            content_type,
            body,
        });
    }

    Err("too many redirects".to_string())
}

fn discover_html_candidates(
    html: &str,
    page_url: &Url,
) -> Result<(Vec<IconCandidate>, Vec<Url>), String> {
    let document = Html::parse_document(html);
    let base_selector = Selector::parse("base[href]").map_err(|error| error.to_string())?;
    let link_selector = Selector::parse("link[rel][href]").map_err(|error| error.to_string())?;
    let base_url = document
        .select(&base_selector)
        .next()
        .and_then(|element| element.value().attr("href"))
        .and_then(|href| page_url.join(href).ok())
        .unwrap_or_else(|| page_url.clone());
    let mut icons = Vec::new();
    let mut manifests = Vec::new();

    for element in document.select(&link_selector) {
        let attributes = element.value();
        let rel = attributes
            .attr("rel")
            .unwrap_or_default()
            .to_ascii_lowercase();
        let rel_tokens = rel.split_ascii_whitespace().collect::<Vec<_>>();
        let href = match attributes
            .attr("href")
            .and_then(|href| base_url.join(href).ok())
        {
            Some(url) if matches!(url.scheme(), "http" | "https") => url,
            _ => continue,
        };

        if rel_tokens.contains(&"manifest") {
            manifests.push(href.clone());
        }

        let is_standard_icon = rel_tokens.contains(&"icon");
        let is_apple_icon = rel_tokens
            .iter()
            .any(|token| token.starts_with("apple-touch-icon"));
        let is_mask_icon = rel_tokens.contains(&"mask-icon");
        if !is_standard_icon && !is_apple_icon && !is_mask_icon {
            continue;
        }

        let media_type = attributes.attr("type").unwrap_or_default();
        let sizes = attributes.attr("sizes").unwrap_or_default();
        let media = attributes.attr("media").unwrap_or_default();
        let mut score = if is_standard_icon {
            100
        } else if is_apple_icon {
            86
        } else {
            68
        };
        score += score_sizes(sizes);
        score += score_media_type(media_type);
        if media.trim().is_empty() {
            score += 4;
        } else if media.to_ascii_lowercase().contains("dark") {
            score -= 8;
        }

        icons.push(IconCandidate { url: href, score });
    }

    Ok((icons, manifests))
}

async fn discover_manifest_candidates(
    client: &Client,
    manifest_url: Url,
) -> Result<Vec<IconCandidate>, String> {
    let resource = fetch_limited(client, manifest_url, MANIFEST_BODY_LIMIT).await?;
    let manifest: WebManifest = serde_json::from_slice(&resource.body)
        .map_err(|error| format!("invalid web app manifest: {error}"))?;
    let mut candidates = Vec::new();

    for icon in manifest.icons {
        let url = match resource.final_url.join(&icon.src) {
            Ok(url) if matches!(url.scheme(), "http" | "https") => url,
            _ => continue,
        };
        let mut score = 80 + score_sizes(&icon.sizes) + score_media_type(&icon.media_type);
        let purposes = icon.purpose.split_ascii_whitespace().collect::<Vec<_>>();
        if purposes.is_empty() || purposes.contains(&"any") {
            score += 8;
        }
        if purposes.len() == 1 && purposes.contains(&"maskable") {
            score -= 6;
        }
        candidates.push(IconCandidate { url, score });
    }

    Ok(candidates)
}

fn add_standard_fallbacks(candidates: &mut Vec<IconCandidate>, page_url: &Url) {
    for (path, score) in [("/favicon.ico", 24), ("/apple-touch-icon.png", 18)] {
        if let Ok(url) = page_url.join(path) {
            candidates.push(IconCandidate { url, score });
        }
    }
}

fn rank_and_deduplicate(mut candidates: Vec<IconCandidate>) -> Vec<IconCandidate> {
    candidates.sort_by(|left, right| right.score.cmp(&left.score));
    let mut seen = HashSet::new();
    candidates
        .into_iter()
        .filter(|candidate| seen.insert(candidate.url.as_str().to_string()))
        .collect()
}

fn score_sizes(value: &str) -> i32 {
    let value = value.trim().to_ascii_lowercase();
    if value.is_empty() {
        return 0;
    }
    if value.split_ascii_whitespace().any(|size| size == "any") {
        return 20;
    }

    value
        .split_ascii_whitespace()
        .filter_map(|size| {
            let (width, height) = size.split_once('x')?;
            let width = width.parse::<i32>().ok()?;
            let height = height.parse::<i32>().ok()?;
            let shortest_edge = width.min(height);
            Some((32 - (shortest_edge - ICON_SIZE as i32).abs() / 4).max(0))
        })
        .max()
        .unwrap_or(0)
}

fn score_media_type(value: &str) -> i32 {
    match value.trim().to_ascii_lowercase().as_str() {
        "image/png" => 12,
        "image/webp" => 10,
        "image/x-icon" | "image/vnd.microsoft.icon" => 8,
        "image/jpeg" | "image/gif" => 4,
        "image/svg+xml" => 10,
        "" => 0,
        _ => -4,
    }
}

fn normalize_icon_to_png(resource: &FetchedResource) -> Result<Vec<u8>, String> {
    if resource.content_type.starts_with("text/") || resource.content_type.contains("json") {
        return Err(format!("unexpected content type {}", resource.content_type));
    }

    if resource.content_type == "image/svg+xml" || looks_like_svg(&resource.body) {
        return normalize_svg_to_png(&resource.body);
    }

    let decoded = decode_raster(&resource.body)?;
    normalize_raster_to_png(decoded)
}

fn looks_like_svg(bytes: &[u8]) -> bool {
    let prefix = String::from_utf8_lossy(&bytes[..bytes.len().min(512)]).to_ascii_lowercase();
    prefix.contains("<svg")
}

fn normalize_svg_to_png(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let options = resvg::usvg::Options::default();
    let tree = resvg::usvg::Tree::from_data(bytes, &options)
        .map_err(|error| format!("invalid SVG icon: {error}"))?;
    let size = tree.size();
    if size.width() <= 0.0 || size.height() <= 0.0 {
        return Err("SVG icon has no drawable size".to_string());
    }

    let scale = (ICON_SIZE as f32 / size.width()).min(ICON_SIZE as f32 / size.height());
    let width = (size.width() * scale).round().max(1.0) as u32;
    let height = (size.height() * scale).round().max(1.0) as u32;
    let mut rendered = resvg::tiny_skia::Pixmap::new(width, height)
        .ok_or_else(|| "failed to allocate SVG rendering buffer".to_string())?;
    resvg::render(
        &tree,
        resvg::tiny_skia::Transform::from_scale(scale, scale),
        &mut rendered.as_mut(),
    );

    let raster = decode_raster(
        &rendered
            .encode_png()
            .map_err(|error| format!("failed to encode rendered SVG: {error}"))?,
    )?;
    normalize_raster_to_png(raster)
}

fn decode_raster(bytes: &[u8]) -> Result<DynamicImage, String> {
    let mut limits = Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(64 * 1024 * 1024);
    let mut reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|error| format!("failed to detect image format: {error}"))?;
    reader.limits(limits);
    reader
        .decode()
        .map_err(|error| format!("unsupported or invalid image: {error}"))
}

fn normalize_raster_to_png(decoded: DynamicImage) -> Result<Vec<u8>, String> {
    let resized = decoded
        .resize(ICON_SIZE, ICON_SIZE, FilterType::Lanczos3)
        .to_rgba8();
    let mut canvas = RgbaImage::from_pixel(ICON_SIZE, ICON_SIZE, Rgba([0, 0, 0, 0]));
    let x = (ICON_SIZE.saturating_sub(resized.width()) / 2) as i64;
    let y = (ICON_SIZE.saturating_sub(resized.height()) / 2) as i64;
    image::imageops::overlay(&mut canvas, &resized, x, y);

    let mut output = Cursor::new(Vec::new());
    DynamicImage::ImageRgba8(canvas)
        .write_to(&mut output, ImageFormat::Png)
        .map_err(|error| format!("failed to encode PNG: {error}"))?;
    Ok(output.into_inner())
}

fn cache_icon(page_url: &Url, png: &[u8]) -> Result<String, String> {
    let origin = page_url.origin().ascii_serialization();
    let digest = Sha256::digest(origin.as_bytes());
    let file_stem = digest[..12]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let relative_path = format!("generated/friend-icons/{file_stem}.png");
    let target = get_workspace_root()?
        .join("apps/web/public")
        .join(&relative_path);

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create favicon cache directory: {error}"))?;
    }
    fs::write(&target, png).map_err(|error| format!("failed to cache favicon: {error}"))?;
    Ok(format!("/{relative_path}"))
}

fn store_external_image(source_url: &str, extension: &str, bytes: &[u8]) -> Result<String, String> {
    let digest = Sha256::digest(source_url.as_bytes());
    let file_stem = digest[..16]
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let relative_path = format!("content-images/external/{file_stem}.{extension}");
    let target = get_workspace_root()?
        .join("apps/web/public")
        .join(&relative_path);

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create image cache directory: {error}"))?;
    }
    fs::write(&target, bytes)
        .map_err(|error| format!("failed to cache external image: {error}"))?;
    Ok(format!("/{relative_path}"))
}

fn get_workspace_root() -> Result<PathBuf, String> {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../..")
        .canonicalize()
        .map_err(|error| format!("failed to locate workspace root: {error}"))
}

fn validate_public_url(url: &Url) -> Result<(), String> {
    if !matches!(url.scheme(), "http" | "https") {
        return Err("only HTTP and HTTPS URLs are allowed".to_string());
    }

    let host = url
        .host_str()
        .ok_or_else(|| "URL has no host".to_string())?;
    let lower_host = host.trim_end_matches('.').to_ascii_lowercase();
    if lower_host == "localhost"
        || lower_host.ends_with(".localhost")
        || lower_host.ends_with(".local")
    {
        return Err("local network hosts are not allowed".to_string());
    }

    if let Ok(ip) = lower_host.parse::<IpAddr>() {
        if is_non_public_ip(ip) {
            return Err("private or reserved network addresses are not allowed".to_string());
        }
        return Ok(());
    }

    let port = url.port_or_known_default().unwrap_or(443);
    let addresses = (host, port)
        .to_socket_addrs()
        .map_err(|error| format!("failed to resolve {host}: {error}"))?
        .collect::<Vec<_>>();
    if addresses.is_empty() {
        return Err(format!("{host} did not resolve to an address"));
    }
    if addresses
        .iter()
        .any(|address| is_non_public_ip(address.ip()))
    {
        return Err("the host resolves to a private or reserved network address".to_string());
    }

    Ok(())
}

fn is_non_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => is_non_public_ipv4(ip),
        IpAddr::V6(ip) => is_non_public_ipv6(ip),
    }
}

fn is_non_public_ipv4(ip: Ipv4Addr) -> bool {
    let [a, b, c, _] = ip.octets();
    a == 0
        || a == 10
        || a == 127
        || (a == 100 && (64..=127).contains(&b))
        || (a == 169 && b == 254)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && b == 168)
        || (a == 192 && b == 0 && c == 0)
        || (a == 192 && b == 0 && c == 2)
        || (a == 198 && (b == 18 || b == 19))
        || (a == 198 && b == 51 && c == 100)
        || (a == 203 && b == 0 && c == 113)
        || a >= 224
}

fn is_non_public_ipv6(ip: Ipv6Addr) -> bool {
    let segments = ip.segments();
    ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_multicast()
        || (segments[0] & 0xfe00) == 0xfc00
        || (segments[0] & 0xffc0) == 0xfe80
        || ip.to_ipv4_mapped().map(is_non_public_ipv4).unwrap_or(false)
}
