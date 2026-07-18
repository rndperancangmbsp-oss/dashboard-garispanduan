# Grist GP Dashboard V4.3 — Sokongan Lampiran Grist

Versi ini membaca kolum `LINK` sebagai kolum **Attachments** Grist, bukan semata-mata URL teks.

## Fail untuk GitHub Pages

Upload terus ke root repositori:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.json` (pilihan)
- `README.md` (pilihan)

`preview.html` hanya untuk semakan reka bentuk dan tidak digunakan sebagai URL Custom Widget.

## Tetapan dalam Grist

1. Pastikan kolum `LINK` dalam database menggunakan jenis **Attachments**.
2. Upload PDF/dokumen terus ke sel dalam kolum tersebut.
3. Dalam Widget options, pilih **Read selected table**.
4. Petakan medan widget `LINK / LAMPIRAN` kepada kolum `LINK` tersebut.
5. Gunakan URL `index.html?v=4.3.0` untuk mengelakkan cache versi lama.

Apabila butang **Buka** diklik, widget mendapatkan token baca sementara daripada Grist dan membuka fail lampiran dalam tab baharu. Jika satu rekod mempunyai beberapa lampiran, butang jadual menunjukkan bilangannya dan membuka lampiran pertama.
