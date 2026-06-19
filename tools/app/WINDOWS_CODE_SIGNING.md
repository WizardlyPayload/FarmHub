# Windows installer signing (SmartScreen & Chrome)

Without signing, Windows shows SmartScreen (**Unknown publisher**) and Chrome may warn on `.exe` downloads.

**There is no code change in Farm Dashboard that removes this.** Microsoft and Google deliberately block unsigned installers from the internet. Self-signed certs do **not** help.

## Do not buy what DigiCert is showing you

The **$83–106/month ($996–1,272/year)** quote is typically:

- **Extended Validation (EV)** — premium tier
- **DigiCert KeyLocker Cloud** — hosted HSM add-on

That stack is for enterprises and driver signing. It is **not** required for a normal desktop app like Farm Dashboard.

| What you saw | Typical annual cost | Needed for Farm Dashboard? |
|--------------|---------------------|----------------------------|
| DigiCert EV + KeyLocker Cloud | ~$1,000+ | **No** |
| DigiCert / Sectigo **OV** (standard) | ~£150–250 **once per year** | Yes — works, reputation builds |
| **Microsoft Azure Artifact Signing** | **~$9.99/month** (~$120/year) | **Best indie option** — cloud signing, no USB token |

## Recommended for indie / small releases: Azure (~$10/month)

**Azure Artifact Signing** (formerly Trusted Signing):

- About **$9.99/month** for 5,000 signatures (enough for many builds).
- No DigiCert-style four-figure bill.
- Needs a **paid** Azure account (not free trial) and identity verification.
- Often gets **SmartScreen trust faster** than cheap OV certs.

Setup overview:

1. Create an Azure **Artifact Signing** account + **Public Trust** certificate profile.
2. Create an app registration (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`).
3. Upgrade **electron-builder** to **25.1.2+** and add `win.azureSignOptions` in `package.json` (see [electron-builder Azure signing](https://github.com/electron-userland/electron-builder/issues/8276)).
4. Build on Windows (signing uses PowerShell `TrustedSigning` module).

We can wire this into `npm run build:app` when you have Azure credentials — say the word after the Azure account is ready.

## Cheaper traditional option: OV certificate (~£200/year)

Buy **standard OV code signing** (not EV) from Sectigo, SSL.com, Certum, K Software, etc.

- One **annual** payment, not $1,000.
- You get a `.pfx` file → set `CSC_LINK` + `CSC_KEY_PASSWORD` before `npm run build:app`.
- SmartScreen may still show **Run anyway** for the first few releases until reputation builds.

## Free signing (SignPath Foundation)

**SignPath** offers free Windows signing for some open-source projects with an **OSI-approved license** (MIT, Apache-2.0, GPL, etc.).

FarmHub’s **custom non-commercial license** is not OSI-standard, so SignPath may **not** accept the project unless you later adopt a permissive open-source license. Alternatives remain **Azure (~$10/month)** or a **standard OV certificate**.

## Until you sign

Beta testers (already on the testers page):

- **Chrome:** Keep / Download anyway
- **Windows:** More info → **Run anyway**

Distribute public builds via **GitHub Releases** when possible — Chrome is less aggressive than a fresh VPS URL.

## Verify a signed build

Right-click `.exe` → **Properties** → **Digital Signatures** → should show a publisher name, not blank.
