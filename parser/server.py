"""Local Docling parser for VU Study.

High-quality document → markdown: real table structure, reading order for multi-column pages,
OCR for scanned pages, and (optionally) maths formulas as LaTeX. Listens on 127.0.0.1 only;
the Next.js server forwards uploads to it from /api/parse — the browser never calls it directly.

Run:  npm run parser          (first run downloads Docling's models, ~1–2 GB)
"""

import io
import os
import threading
import time

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from docling.datamodel.accelerator_options import AcceleratorDevice, AcceleratorOptions
from docling.datamodel.base_models import DocumentStream, InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, ImageFormatOption, PdfFormatOption

MAX_BYTES = 50 * 1024 * 1024
SUPPORTED = {".pdf", ".docx", ".pptx", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".bmp"}

app = FastAPI(title="VU Study parser")

# Building a converter loads models, so keep one per option set. Conversions run one at a time:
# on a laptop CPU two in parallel would only compete for RAM.
_converters: dict[bool, DocumentConverter] = {}
_build_lock = threading.Lock()
_run_lock = threading.Lock()


def converter(formulas: bool) -> DocumentConverter:
    with _build_lock:
        if formulas not in _converters:
            opts = PdfPipelineOptions()
            # Default is 4 threads; a laptop CPU with no GPU needs every core, above all for formulas.
            opts.accelerator_options = AcceleratorOptions(num_threads=os.cpu_count() or 4, device=AcceleratorDevice.CPU)
            opts.do_ocr = True                      # only used where a page has no text layer
            opts.do_table_structure = True
            opts.table_structure_options.do_cell_matching = True
            opts.do_formula_enrichment = formulas   # formulas → LaTeX; slow on CPU, so opt-in
            _converters[formulas] = DocumentConverter(format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=opts),
                InputFormat.IMAGE: ImageFormatOption(pipeline_options=opts),
            })
        return _converters[formulas]


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/convert")
def convert(file: UploadFile = File(...), formulas: bool = Form(False)):
    name = file.filename or "upload"
    ext = os.path.splitext(name)[1].lower()
    if ext not in SUPPORTED:
        raise HTTPException(415, f"Docling can't read {ext or 'this file'} files.")
    data = file.file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File is larger than 50 MB.")

    started = time.time()
    with _run_lock:
        result = converter(formulas).convert(DocumentStream(name=name, stream=io.BytesIO(data)))
    doc = result.document

    # Page markers let the notes cite "Handout p.X"; Word files have no pages.
    pages = doc.num_pages()
    if pages:
        parts = []
        for n in range(1, pages + 1):
            md = doc.export_to_markdown(page_no=n).strip()
            if md:
                parts.append(f"[Page {n}]\n{md}")
        text = "\n\n".join(parts)
    else:
        text = doc.export_to_markdown().strip()

    # Without formula enrichment Docling leaves an HTML comment where each formula was; make the gap
    # visible so the student knows to re-run with maths mode or fill it in.
    placeholder = "<!-- formula-not-decoded -->"
    skipped = text.count(placeholder)
    text = text.replace(placeholder, "[formula]")

    return {"text": text, "pages": pages, "formulas_skipped": skipped, "seconds": round(time.time() - started, 1)}
