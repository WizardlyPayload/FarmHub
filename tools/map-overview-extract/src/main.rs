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

fn main() {
    let mut args = env::args_os().skip(1);
    let archive_path = args.next().map(PathBuf::from);
    let output_dir = args.next().map(PathBuf::from);
    if args.next().is_some() || archive_path.is_none() || output_dir.is_none() {
        eprintln!("usage: farmdash-map-overview-extract <local .dlc> <output directory>");
        std::process::exit(2);
    }
    if let Err(error) = run(&archive_path.unwrap(), &output_dir.unwrap()) {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
