from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import UUID

from fastapi import HTTPException, Request
from pypdf import PdfReader
from pypdf.errors import PyPdfError

MAX_PDF_BYTES = 16 * 1024 * 1024


def pdf_export_directory(repository: Path, configured_path: str | None) -> Path | None:
    if configured_path:
        return repository / configured_path
    if (repository / ".git").exists():
        return repository / "output" / "pdf" / "test-results"
    return None


async def read_pdf_upload(request: Request) -> bytearray:
    content_type = request.headers.get("content-type", "").partition(";")[0].strip().lower()
    if content_type != "application/pdf":
        raise HTTPException(415, "Send the report as application/pdf.")

    data = bytearray()
    async for chunk in request.stream():
        if len(data) + len(chunk) > MAX_PDF_BYTES:
            raise HTTPException(413, "The PDF exceeds the 16 MB export limit.")
        data.extend(chunk)
    if not data.startswith(b"%PDF-") or not data.rstrip().endswith(b"%%EOF"):
        raise HTTPException(400, "The report is not a complete PDF.")
    return data


def save_pdf_export(directory: Path, attempt_id: UUID, data: bytearray) -> None:
    try:
        with BytesIO(data) as stream:
            report = PdfReader(stream, strict=True)
            if report.is_encrypted or not report.pages:
                raise ValueError("The report must have at least one readable page.")
    except (PyPdfError, ValueError, KeyError, TypeError, IndexError, RecursionError, OverflowError) as error:
        raise HTTPException(400, "The report is not a readable PDF.") from error

    directory.mkdir(parents=True, exist_ok=True)
    temporary_path = None
    try:
        with NamedTemporaryFile(dir=directory, suffix=".tmp", delete=False) as stream:
            temporary_path = Path(stream.name)
            stream.write(data)
        # Publish the complete file in one step. Another download of this attempt replaces the copy.
        temporary_path.replace(directory / f"{attempt_id}.pdf")
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)
