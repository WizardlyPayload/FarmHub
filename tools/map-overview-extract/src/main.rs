//! Read one locally installed DLC overview without loading the multi-gigabyte archive.
//! The file table and selected image are the only archive bytes held in memory.

use gar_lib::{GarCipher, ALL_KEYS};
use std::env;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

const MAX_IMAGE_BYTES: u64 = 64 * 1024 * 1024;
const MAX_TABLE_BYTES: u64 = 64 * 1024 * 1024;
const ENTRY_BYTES: usize = 0x200;

fn le_u16(bytes: &[u8], at: usize) -> u16 {
    u16::from_le_bytes(bytes[at..at + 2].try_into().unwrap())
}
fn le_u32(bytes: &[u8], at: usize) -> u32 {
    u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap())
}
fn le_u64(bytes: &[u8], at: usize) -> u64 {
    u64::from_le_bytes(bytes[at..at + 8].try_into().unwrap())
}

fn overview_rank(name: &str) -> Option<usize> {
    let lower = name.replace('\\', "/").to_ascii_lowercase();
    match lower.as_str() {
        "map/textures/ui/overview.dds" => Some(0),
        "map/textures/ui/overview.png" => Some(1),
        "map/overview.dds" => Some(2),
        "map/overview.png" => Some(3),
        _ if !lower.contains("/preview") && lower.ends_with("/textures/ui/overview.dds") => Some(4),
        _ if !lower.contains("/preview") && lower.ends_with("/textures/ui/overview.png") => Some(5),
        _ => None,
    }
}

fn run(archive_path: &Path, output_dir: &Path) -> Result<(), String> {
    if !archive_path.extension().is_some_and(|e| e.eq_ignore_ascii_case("dlc")) {
        return Err("input must be a .dlc archive".into());
    }
    let mut archive = File::open(archive_path).map_err(|e| format!("open archive: {e}"))?;
    let archive_len = archive.metadata().map_err(|e| format!("archive metadata: {e}"))?.len();
    if archive_len < 0x400 { return Err("archive is too small".into()); }
    let mut header = [0u8; 0x70];
    archive.read_exact(&mut header).map_err(|e| format!("read header: {e}"))?;
    if &header[0x60..0x64] != b"GAR " { return Err("GAR magic mismatch".into()); }
    let version = le_u16(&header, 0x64);
    let count = u64::from(le_u32(&header, 0x68))
        + if version >= 3 { u64::from(le_u32(&header, 0x6C)) } else { 0 };
    let table_len = count.checked_mul(ENTRY_BYTES as u64).ok_or("file table overflow")?;
    if table_len < ENTRY_BYTES as u64 || table_len > MAX_TABLE_BYTES
        || 0x200u64.checked_add(table_len).is_none_or(|end| end > archive_len) {
        return Err("file table size is invalid".into());
    }
    archive.seek(SeekFrom::Start(0x200)).map_err(|e| format!("seek table: {e}"))?;
    let mut encrypted_table = vec![0u8; table_len as usize];
    archive.read_exact(&mut encrypted_table).map_err(|e| format!("read table: {e}"))?;

    let mut selected_cipher = None;
    for (k1, k2, k3, k4) in ALL_KEYS {
        let cipher = GarCipher::from_keys(k1, k2, k3, k4);
        let first = cipher.decrypt(&encrypted_table[..ENTRY_BYTES]);
        if le_u32(&first, 4) == 0 {
            selected_cipher = Some(cipher);
            break;
        }
    }
    let cipher = selected_cipher.ok_or("could not decrypt file table")?;
    let table = cipher.decrypt(&encrypted_table);
    let mut selected: Option<(usize, u64, u64, u64, String)> = None;
    for entry in table.chunks_exact(ENTRY_BYTES) {
        if le_u64(entry, 0) == 0 { continue; }
        let name_bytes = &entry[0x28..];
        let end = name_bytes.iter().position(|&byte| byte == 0).unwrap_or(name_bytes.len());
        let name = String::from_utf8_lossy(&name_bytes[..end]);
        let Some(rank) = overview_rank(&name) else { continue; };
        let size = le_u64(entry, 0x10);
        let encrypted_size = le_u64(entry, 0x08);
        let offset = le_u64(entry, 0x18);
        if size == 0 || size > MAX_IMAGE_BYTES || encrypted_size == 0
            || encrypted_size > MAX_IMAGE_BYTES + 0x1000
            || offset.checked_add(encrypted_size).is_none_or(|end| end > archive_len) {
            continue;
        }
        if selected.as_ref().is_none_or(|(best, ..)| rank < *best) {
            selected = Some((rank, offset, encrypted_size, size, name.into_owned()));
        }
    }
    let (_, offset, encrypted_size, size, name) = selected.ok_or("no valid overview image in archive")?;
    archive.seek(SeekFrom::Start(offset)).map_err(|e| format!("seek overview: {e}"))?;
    let mut encrypted = vec![0u8; encrypted_size as usize];
    archive.read_exact(&mut encrypted).map_err(|e| format!("read overview: {e}"))?;
    let mut image = cipher.decrypt_dlc(&encrypted);
    if image.len() < size as usize { return Err("overview was truncated".into()); }
    image.truncate(size as usize);
    let extension = if name.to_ascii_lowercase().ends_with(".png") { "png" } else { "dds" };
    fs::create_dir_all(output_dir).map_err(|e| format!("create output directory: {e}"))?;
    let output_path = output_dir.join(format!("overview.{extension}"));
    fs::write(&output_path, image).map_err(|e| format!("write overview: {e}"))?;
    println!("{}", output_path.display());
    Ok(())
}

// Unpack only the locally installed game's fill-type HUD textures. The app
// converts these DDS files to PNG in its own cache; game artwork is never
// shipped in the installer.
fn run_hud(archive_path: &Path, output_dir: &Path) -> Result<(), String> {
    if !archive_path.extension().is_some_and(|e| e.eq_ignore_ascii_case("gar") || e.eq_ignore_ascii_case("dlc")) {
        return Err("HUD input must be a .gar or .dlc archive".into());
    }
    let is_dlc = archive_path.extension().is_some_and(|e| e.eq_ignore_ascii_case("dlc"));
    let mut archive = File::open(archive_path).map_err(|e| format!("open HUD archive: {e}"))?;
    let archive_len = archive.metadata().map_err(|e| format!("HUD archive metadata: {e}"))?.len();
    if archive_len < 0x400 { return Err("HUD archive is too small".into()); }
    let mut header = [0u8; 0x70];
    archive.read_exact(&mut header).map_err(|e| format!("read HUD header: {e}"))?;
    if &header[0x60..0x64] != b"GAR " { return Err("HUD archive GAR magic mismatch".into()); }
    let version = le_u16(&header, 0x64);
    let entries = u64::from(le_u32(&header, 0x68))
        + if version >= 3 { u64::from(le_u32(&header, 0x6C)) } else { 0 };
    let table_len = entries.checked_mul(ENTRY_BYTES as u64).ok_or("HUD file table overflow")?;
    if table_len < ENTRY_BYTES as u64 || table_len > MAX_TABLE_BYTES
        || 0x200u64.checked_add(table_len).is_none_or(|end| end > archive_len) {
        return Err("HUD file table size is invalid".into());
    }
    archive.seek(SeekFrom::Start(0x200)).map_err(|e| format!("seek HUD table: {e}"))?;
    let mut encrypted_table = vec![0u8; table_len as usize];
    archive.read_exact(&mut encrypted_table).map_err(|e| format!("read HUD table: {e}"))?;
    let mut selected_cipher = None;
    for (k1, k2, k3, k4) in ALL_KEYS {
        let cipher = GarCipher::from_keys(k1, k2, k3, k4);
        if le_u32(&cipher.decrypt(&encrypted_table[..ENTRY_BYTES]), 4) == 0 {
            selected_cipher = Some(cipher);
            break;
        }
    }
    let cipher = selected_cipher.ok_or("could not decrypt HUD file table")?;
    let table = cipher.decrypt(&encrypted_table);
    fs::create_dir_all(output_dir).map_err(|e| format!("create HUD output directory: {e}"))?;
    let mut count = 0usize;
    for entry in table.chunks_exact(ENTRY_BYTES) {
        if le_u64(entry, 0) == 0 { continue; }
        let name_bytes = &entry[0x28..];
        let end = name_bytes.iter().position(|&byte| byte == 0).unwrap_or(name_bytes.len());
        let normalized = String::from_utf8_lossy(&name_bytes[..end]).replace('\\', "/");
        let lower = normalized.to_ascii_lowercase();
        let basename = if let Some((_, name)) = lower.rsplit_once("/menu/hud/filltypes/") {
            name
        } else if let Some(name) = lower.strip_prefix("menu/hud/filltypes/") {
            name
        } else {
            continue;
        };
        if basename.contains('/') || basename.is_empty() { continue; }
        if !basename.ends_with(".dds") && !basename.ends_with(".png") { continue; }
        let original_base = normalized.rsplit('/').next().unwrap_or("");
        if original_base.is_empty() || original_base == "." || original_base == ".." { continue; }
        let output = output_dir.join(original_base);
        if output.exists() { continue; }
        let size = le_u64(entry, 0x10);
        let encrypted_size = le_u64(entry, 0x08);
        let offset = le_u64(entry, 0x18);
        if size == 0 || size > MAX_IMAGE_BYTES || encrypted_size == 0
            || encrypted_size > MAX_IMAGE_BYTES + 0x1000
            || offset.checked_add(encrypted_size).is_none_or(|end| end > archive_len) {
            continue;
        }
        archive.seek(SeekFrom::Start(offset)).map_err(|e| format!("seek HUD {original_base}: {e}"))?;
        let mut encrypted = vec![0u8; encrypted_size as usize];
        archive.read_exact(&mut encrypted).map_err(|e| format!("read HUD {original_base}: {e}"))?;
        let mut bytes = if is_dlc { cipher.decrypt_dlc(&encrypted) } else { cipher.decrypt(&encrypted) };
        if bytes.len() < size as usize { return Err(format!("HUD {original_base} was truncated")); }
        bytes.truncate(size as usize);
        if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES as usize { continue; }
        let partial = output.with_extension("partial");
        fs::write(&partial, bytes).map_err(|e| format!("write HUD {original_base}: {e}"))?;
        fs::rename(&partial, &output).map_err(|e| format!("finish HUD {original_base}: {e}"))?;
        count += 1;
    }
    println!("HUD textures extracted: {count}");
    Ok(())
}

fn main() {
    let mut args = env::args_os().skip(1);
    let first = args.next();
    let hud_mode = first.as_deref() == Some(std::ffi::OsStr::new("--hud"));
    let archive_path = if hud_mode { args.next() } else { first }.map(PathBuf::from);
    let output_dir = args.next().map(PathBuf::from);
    if args.next().is_some() || archive_path.is_none() || output_dir.is_none() {
        eprintln!("usage: farmdash-map-overview-extract [--hud] <local .dlc/.gar> <output directory>");
        std::process::exit(2);
    }
    let archive_path = archive_path.unwrap();
    let output_dir = output_dir.unwrap();
    let result = if hud_mode { run_hud(&archive_path, &output_dir) } else { run(&archive_path, &output_dir) };
    if let Err(error) = result {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
