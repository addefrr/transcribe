import logging
import os
import shutil

from . import config
from .errors import JobError

log = logging.getLogger(__name__)

_s3_client = None


def _s3():
    global _s3_client
    if _s3_client is None:
        import boto3
        from botocore.config import Config as BotoConfig

        _s3_client = boto3.client(
            "s3",
            endpoint_url=config.S3_ENDPOINT or None,
            region_name=config.S3_REGION,
            aws_access_key_id=config.S3_ACCESS_KEY_ID,
            aws_secret_access_key=config.S3_SECRET_ACCESS_KEY,
            config=BotoConfig(
                s3={"addressing_style": "path" if config.S3_FORCE_PATH_STYLE else "auto"}
            ),
        )
    return _s3_client


def _safe_local_path(key: str) -> str:
    base = os.path.realpath(config.UPLOAD_DIR)
    path = os.path.realpath(os.path.join(base, key))
    if not path.startswith(base + os.sep):
        raise JobError("Invalid upload key.")
    return path


def fetch_upload(key: str, workdir: str) -> str:
    """Bring an uploaded file into the job workdir; returns its local path."""
    dest = os.path.join(workdir, "upload" + os.path.splitext(key)[1])
    if config.STORAGE_DRIVER == "local":
        src = _safe_local_path(key)
        if not os.path.exists(src):
            raise JobError("Uploaded file not found — it may have expired.")
        shutil.copyfile(src, dest)
    else:
        try:
            _s3().download_file(config.S3_BUCKET, key, dest)
        except Exception as exc:
            raise JobError(f"Could not fetch upload from storage: {exc}") from exc
    return dest


def put_file(path: str, key: str) -> None:
    _s3().upload_file(path, config.S3_BUCKET, key)


def presign_get(key: str, expires: int = 6 * 3600) -> str:
    return _s3().generate_presigned_url(
        "get_object",
        Params={"Bucket": config.S3_BUCKET, "Key": key},
        ExpiresIn=expires,
    )


def delete_key(key: str) -> None:
    """Best-effort delete of a stored object; never raises."""
    try:
        if config.STORAGE_DRIVER == "local":
            os.remove(_safe_local_path(key))
        else:
            _s3().delete_object(Bucket=config.S3_BUCKET, Key=key)
    except FileNotFoundError:
        pass
    except Exception:
        log.warning("could not delete stored object %r", key, exc_info=True)
